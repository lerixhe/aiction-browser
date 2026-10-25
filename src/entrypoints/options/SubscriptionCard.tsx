/**
 * 订阅套餐卡（M3，契约 §4.3 / §7.1）。
 *
 * 三条硬约束：
 * 1. **价格与额度只来自服务端**（`/v1/meta.plans`）。仓库是公开的，任何写进代码的价目表
 *    都等于把定价策略公开；`PlanOffer` 解析层还会丢掉 0 价档与未知档位。
 * 2. **升级走 `CHECKOUT_REQUEST`**（由 background 创建会话并打开结算页），扩展内不内嵌支付：
 *    卡号永远不进扩展（PCI + 商店政策双向限制）。
 * 3. **结算后要看到结果**：点完升级在本卡里启一个 3s × 100 的 `/v1/me` 轮询（契约 §7.1），
 *    plan 一变就停并给出反馈。轮询放 UI 不放 background —— SW 空闲 30s 就会被回收，
 *    `setTimeout` 随之丢失，那正是「付了钱额度还是旧的」的常见成因。
 */
import { useEffect, useRef, useState } from "react"

import { trackEvent } from "@/shared/analytics"
import { planLabelKey } from "@/shared/auth/actions"
import { CHECKOUT_POLL_INTERVAL_MS, CHECKOUT_POLL_MAX_ATTEMPTS } from "@/shared/auth/config"
import type {
  BillingInterval,
  CheckoutResponse,
  EntitlementsResponse,
  MetaResponse,
  PlanId,
  PlanOffer,
  ServerMeta
} from "@/shared/auth/types"
import { PLAN_RANK, hasPlanChanged, isPlanUpgrade } from "@/shared/auth/types"
import { MESSAGE_TYPES } from "@/shared/constants"
import { useI18n } from "@/shared/i18n/context"
import { parseLocaleTag } from "@/shared/language-tag"
import { Button, Hint, SectionCard, SegmentedControl, Skeleton, StatusMessage } from "./ui"

const MSG = MESSAGE_TYPES

interface SubscriptionCardProps {
  /** 当前档位（取快照，`/v1/me` 失败不会降级） */
  plan: PlanId
  signedIn: boolean
  /** 未登录时点「选择」不是静默回弹，而是直接拉起登录 */
  onRequireSignIn: () => void
  /** 去客户门户（降级 / 改卡 / 取消只在那里做） */
  onManage: () => void
  /** 结算确认到新档位：让父组件重拉权益（到期日 / 状态） */
  onUpgraded: () => void
}

/** 结算后轮询的上下文。基线取**点按钮那一刻**的档位，之后所有比较都以它为准 */
interface UpgradeWatch {
  baselinePlan: PlanId
  interval: BillingInterval
  startedAt: number
}

function clientVersion(): string {
  try {
    return chrome.runtime.getManifest().version
  } catch {
    return "0.0.0"
  }
}

function elapsedBucket(ms: number): string {
  if (ms < 30_000) return "<30s"
  if (ms < 120_000) return "30-120s"
  return ">120s"
}

export function SubscriptionCard({
  plan,
  signedIn,
  onRequireSignIn,
  onManage,
  onUpgraded
}: SubscriptionCardProps) {
  const { t, locale } = useI18n()
  const [meta, setMeta] = useState<ServerMeta | null>(null)
  const [metaLoaded, setMetaLoaded] = useState(false)
  /** 版本门槛的结论由 background 下发（UI 不做版本比较） */
  const [outdated, setOutdated] = useState(false)
  const [interval, setInterval] = useState<BillingInterval>("month")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [watch, setWatch] = useState<UpgradeWatch | null>(null)
  /**
   * 拉取失败时允许重试（递增即重跑 effect）。
   *
   * 为什么必须有：`META_REQUEST` 在两种常见情形下拿不到东西——扩展刚更新但 background 还是旧代码
   * （`sendMessage` 返回 `undefined`）、本地 mock / 网关没起来。没有重试的话用户只能靠切分区或
   * 重开页面自愈，而界面上一句「暂时无法获取」不会告诉任何人该做什么。
   */
  const [attempt, setAttempt] = useState(0)
  /**
   * `onUpgraded` 放 ref：轮询 effect 不能把它放依赖数组。
   * 父组件每次重渲染都会传一个新函数，放进依赖就是「每次渲染都重新开始轮询」——
   * 表现是“等了五分钟也没确认到升级”。
   */
  const onUpgradedRef = useRef(onUpgraded)
  onUpgradedRef.current = onUpgraded

  const localeTag = parseLocaleTag(locale)?.toString() ?? "en"

  useEffect(() => {
    let alive = true
    setMetaLoaded(false)

    void (async () => {
      try {
        const response = (await chrome.runtime.sendMessage({
          type: MSG.META_REQUEST
        })) as MetaResponse | undefined
        if (!alive) return
        setMeta(response?.meta ?? null)
        setOutdated(response?.clientOutdated === true)
      } catch {
        if (alive) {
          setMeta(null)
          setOutdated(false)
        }
      } finally {
        if (alive) setMetaLoaded(true)
      }
    })()

    return () => {
      alive = false
    }
  }, [attempt])

  const offers = meta?.plans ?? []
  const hasMonthly = offers.some((offer) => offer.interval === "month")
  const hasYearly = offers.some((offer) => offer.interval === "year")

  // 默认周期跟着服务端实际有的走：只有年付时不要停在一个空的月付页面上
  useEffect(() => {
    if (hasMonthly || !hasYearly) return
    setInterval("year")
  }, [hasMonthly, hasYearly])

  const visibleOffers = offers.filter((offer) =>
    offer.interval === null ? true : offer.interval === interval
  )

  /**
   * 结算后轮询（契约 §7.1：3s × 100 次 ≈ 5 分钟）。
   *
   * 三个停止条件，缺一不可：
   * - 档位一变（**任意方向**）→ 服务端已处理完，停下并广播结果；
   * - 次数用完 → 停下并提示「稍后重开本页查看」，不假装成功；
   * - 组件卸载（切分区 / 关页）→ 清定时器。
   */
  useEffect(() => {
    if (!watch) return

    let cancelled = false
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      if (cancelled) return
      attempts++

      try {
        const response = (await chrome.runtime.sendMessage({
          type: MSG.ENTITLEMENTS_REQUEST,
          payload: { force: true }
        })) as EntitlementsResponse | undefined
        if (cancelled) return

        const nextPlan = response?.snapshot?.plan
        if (nextPlan && hasPlanChanged(watch.baselinePlan, nextPlan)) {
          // `subscription_activated` 只在**升级**时报（降级是用户取消订阅，漏斗里不是同一个动作）
          if (isPlanUpgrade(watch.baselinePlan, nextPlan)) {
            void trackEvent("subscription_activated", {
              plan: nextPlan,
              period: watch.interval,
              is_first: watch.baselinePlan === "free" || watch.baselinePlan === "anonymous",
              elapsed_bucket: elapsedBucket(Date.now() - watch.startedAt),
              source: "options"
            })
          }
          setNotice(t("options.account.upgraded"))
          setWatch(null)
          onUpgradedRef.current()
          return
        }
      } catch {
        // 单次失败继续轮询：网络抖一下不该让「付完钱看不到额度」变成常态
      }

      if (cancelled) return
      if (attempts >= CHECKOUT_POLL_MAX_ATTEMPTS) {
        setError(t("options.account.checkoutTimeout"))
        setWatch(null)
        return
      }
      timer = setTimeout(() => void tick(), CHECKOUT_POLL_INTERVAL_MS)
    }

    timer = setTimeout(() => void tick(), CHECKOUT_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [watch, t])

  const handleChoose = async (offer: PlanOffer) => {
    // 降级 / 换卡 / 取消都只发生在客户门户（契约 §7.2）：结算接口只会创建**新的**订阅
    if (PLAN_RANK[offer.id] <= PLAN_RANK[plan]) {
      onManage()
      return
    }
    if (!signedIn) {
      onRequireSignIn()
      return
    }
    if (busy) return

    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const response = (await chrome.runtime.sendMessage({
        type: MSG.CHECKOUT_REQUEST,
        payload: { plan: offer.id, interval: offer.interval ?? interval }
      })) as CheckoutResponse | undefined

      if (!response?.success) {
        setError(t("options.account.checkoutFailed"))
        return
      }
      // 结算页已打开：立刻开始盯结果（用户此刻在另一个标签里付款）
      void trackEvent("checkout_started", {
        plan: offer.id,
        period: offer.interval ?? interval,
        source: "options"
      })
      setWatch({ baselinePlan: plan, interval: offer.interval ?? interval, startedAt: Date.now() })
    } catch {
      setError(t("options.account.checkoutFailed"))
    } finally {
      setBusy(false)
    }
  }

  const formatPrice = (offer: PlanOffer): string => {
    try {
      return new Intl.NumberFormat(localeTag, {
        style: "currency",
        currency: offer.currency,
        // 整数价不显示 .00（服务端下发 29 而不是 29.0）
        maximumFractionDigits: Number.isInteger(offer.price) ? 0 : 2
      }).format(offer.price)
    } catch {
      // 货币代码不认识（服务端新增币种）：退回「数值 + 代码」，不要整张卡消失
      return `${offer.price} ${offer.currency}`
    }
  }

  const formatQuota = (tokens: number): string => {
    if (!(tokens > 0)) return t("options.account.planQuotaUnknown")
    try {
      const formatted = new Intl.NumberFormat(localeTag, {
        notation: "compact",
        maximumFractionDigits: 1
      }).format(tokens)
      return t("options.account.planQuota", [formatted])
    } catch {
      return t("options.account.planQuota", [String(tokens)])
    }
  }

  const intervalLabel = (value: BillingInterval): string =>
    value === "month" ? t("options.account.planIntervalMonthly") : t("options.account.planIntervalYearly")

  const maintenanceActive = meta?.maintenance.active === true

  return (
    <SectionCard title={t("options.account.plansTitle")} description={t("options.account.plansDesc")}>
      {maintenanceActive ? (
        <Hint warning>
          {meta?.maintenance.message
            ? t("options.account.maintenanceNotice", [meta.maintenance.message])
            : t("options.account.maintenanceNoticeGeneric")}
        </Hint>
      ) : null}
      {outdated ? <Hint warning>{t("options.account.clientOutdated")}</Hint> : null}

      {!metaLoaded ? (
        <Skeleton style={{ width: "100%", height: 96 }} />
      ) : visibleOffers.length === 0 ? (
        // 服务端没给套餐表：少画一张卡，不画一个空框（也不要显示「免费」把用户骗进来）
        <div className="opt-plans-empty">
          <span>{t("options.account.plansUnavailable")}</span>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            {t("options.account.retry")}
          </Button>
        </div>
      ) : (
        <>
          {hasMonthly && hasYearly ? (
            <div className="opt-plans-switch">
              <SegmentedControl
                value={interval}
                ariaLabel={t("options.account.plansTitle")}
                options={[
                  { value: "month" as const, label: intervalLabel("month") },
                  { value: "year" as const, label: intervalLabel("year") }
                ]}
                onValueChange={(value) => setInterval(value)}
              />
            </div>
          ) : null}

          <ul className="opt-plans">
            {visibleOffers.map((offer) => {
              const current = offer.id === plan
              const lower = PLAN_RANK[offer.id] < PLAN_RANK[plan]
              return (
                <li className={`opt-plan${current ? " opt-plan--current" : ""}`} key={offer.id}>
                  <div className="opt-plan-head">
                    <span className="opt-plan-name">{t(planLabelKey(offer.id))}</span>
                    {current ? (
                      <span className="opt-badge opt-badge--accent">{t("options.account.planCurrent")}</span>
                    ) : null}
                  </div>
                  <div className="opt-plan-price">{formatPrice(offer)}</div>
                  <div className="opt-plan-meta">
                    {formatQuota(offer.quotaTokens)}
                    {offer.interval ? ` · ${intervalLabel(offer.interval)}` : ""}
                  </div>
                  <Button
                    variant={current ? "secondary" : "primary"}
                    size="sm"
                    disabled={busy || current}
                    onClick={() => void handleChoose(offer)}>
                    {current
                      ? t("options.account.planCurrent")
                      : lower
                        ? t("options.account.manage")
                        : signedIn
                          ? t("options.account.planChoose")
                          : t("options.account.planSignInToChoose")}
                  </Button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {watch ? <Hint>{t("options.account.checkoutWaiting")}</Hint> : null}
      {notice ? <StatusMessage tone="success">{notice}</StatusMessage> : null}
      {error ? <Hint warning>{error}</Hint> : null}
    </SectionCard>
  )
}
