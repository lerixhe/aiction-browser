import { useCallback, useEffect, useRef, useState } from "react"

import { trackEvent, usedRatioBucket } from "@/shared/analytics"

import { manageSubscriptionAction, planLabelKey, subscriptionStatusKey } from "@/shared/auth/actions"
import { OFFICIAL_AI_ENABLED, DEFAULT_OFFICIAL_MODEL } from "@/shared/auth/config"
import type {
  AuthSignInResponse,
  AuthSignOutResponse,
  BillingPortalResponse,
  Entitlements,
  EntitlementsResponse,
  OfficialModel,
  OfficialModelsResponse,
  PlanId
} from "@/shared/auth/types"
import { useAuthSnapshot } from "@/shared/auth/use-auth-snapshot"
import { MESSAGE_TYPES } from "@/shared/constants"
import { useI18n } from "@/shared/i18n/context"
import { parseLocaleTag } from "@/shared/language-tag"
import { resolveActiveProvider } from "@/shared/provider-resolve"
import { getActiveProvider } from "@/shared/storage"
import type { ExtensionSettings } from "@/shared/types"
import { ConfirmDialog } from "./ConfirmDialog"
import { Button, FieldGroup, Hint, SectionCard, SegmentedControl, SelectField, SettingRow, Skeleton } from "./ui"
import { SubscriptionCard } from "./SubscriptionCard"
import { UsageTrendCard } from "./UsageTrendCard"

interface AccountSectionProps {
  settings: ExtensionSettings
  saveSettingsNow: (updater: (current: ExtensionSettings) => ExtensionSettings) => void
}

type EngineChoice = "official" | "byok"

const MSG = MESSAGE_TYPES

/**
 * 账号分区（SPEC §8.1 / docs/OPTIONS_UI.md §2.3）。
 *
 * 这里全是**即时项**：登录、登出、订阅跳转、引擎切换都直接改已保存状态，
 * 因此整张卡没有保存条，也不参与 ⌘S。
 *
 * 三条状态口径（写错任何一条都会让用户看见错误的账号状态）：
 * 1. `loading` ≠ 未登录：快照没就绪就画骨架，不要先渲染「未登录」再跳变；
 * 2. `/v1/me` 失败不降级：plan 保留旧值，只在卡片里给一行提示；
 * 3. `past_due` 给「管理订阅」，不给「升级」。
 */
export function AccountSection({ settings, saveSettingsNow }: AccountSectionProps) {
  const { t, locale } = useI18n()
  const { snapshot, loading } = useAuthSnapshot()

  const [signingIn, setSigningIn] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null)
  const [entitlementsFailed, setEntitlementsFailed] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  /** 额度提示每个挂载只上报一次（React 重渲染会反复触发 effect） */
  const quotaBannerReportedRef = useRef(false)

  const signedIn = snapshot.state === "signed-in"
  /**
   * 有主体 = 已登录**或**已领到匿名 device token。
   * 匿名用户也有官方额度（契约 §3.1），所以「用量」行对他们同样要显示——
   * 这是 M2 之后新用户零配置就能看到自己额度的唯一地方。
   */
  const hasPrincipal = snapshot.state !== "signed-out"

  // 权益（订阅到期日 / 客户门户链接）：只在进入本分区或登录态变化时强制回源一次。
  // 依赖用 `state` 而不是 `updatedAt`：后者在登录流程里会变两次，白白多打一次 /v1/me。
  const mountedRef = useRef(true)
  /** 最近一次拉权益的时间：`visibilitychange` 回源靠它节流（切回来十几次不该发十几次请求） */
  const lastFetchRef = useRef(0)

  const refreshEntitlements = useCallback(async (force: boolean) => {
    lastFetchRef.current = Date.now()
    try {
      const response = (await chrome.runtime.sendMessage({
        type: MSG.ENTITLEMENTS_REQUEST,
        payload: { force }
      })) as EntitlementsResponse | undefined
      if (!mountedRef.current) return
      if (response?.success && response.entitlements) {
        setEntitlements(response.entitlements)
        setEntitlementsFailed(false)
      } else {
        // 失败**不改 plan**：一次 500 不能把 pro 用户显示成 free
        setEntitlementsFailed(true)
      }
    } catch {
      if (mountedRef.current) setEntitlementsFailed(true)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!hasPrincipal) {
      setEntitlements(null)
      setEntitlementsFailed(false)
      return
    }
    void refreshEntitlements(true)
  }, [hasPrincipal, refreshEntitlements])

  /**
   * 从外部结算页切回来时强制回源一次（契约 §4.1「结算页关闭后回来」）。
   *
   * 这是轮询之外的第二道保险：用户可能在 Options 页被关掉 / 刷新后直接去付款，
   * 那种情况下没人轮询，只有「页面重新可见」这个时机能发现档位已经变了。
   */
  useEffect(() => {
    if (!hasPrincipal) return
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return
      if (Date.now() - lastFetchRef.current < 15_000) return
      void refreshEntitlements(true)
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [hasPrincipal, refreshEntitlements])

  const formatDate = (iso: string): string => {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return iso
    // `locale` 是注册表 id（如 `zh_CN`），Intl 需要 BCP47 标签（`zh-CN`）；
    // 直接传 `zh_CN` 会抛 RangeError，`catch` 里就退化成显示原始 ISO 串了
    const tag = parseLocaleTag(locale)?.toString()
    try {
      return new Intl.DateTimeFormat(tag ?? "en", {
        year: "numeric",
        month: "short",
        day: "numeric"
      }).format(date)
    } catch {
      return iso
    }
  }

  // 账号区「可见」：只有真的能看到额度（有会话且快照就绪）才上报，未登录没有额度可看
  useEffect(() => {
    if (quotaBannerReportedRef.current || loading) return
    if (snapshot.state === "signed-out") return
    quotaBannerReportedRef.current = true
    void trackEvent("quota_banner_shown", {
      plan: snapshot.plan,
      used_ratio_bucket: usedRatioBucket(snapshot.quota?.usedRatio),
      surface: "options",
      source: "options"
    })
  }, [loading, snapshot])

  const handleSignIn = async () => {
    if (signingIn) return
    setSigningIn(true)
    setActionError(null)
    void trackEvent("auth_sign_in_started", { entry: "options", source: "options" })
    try {
      const response = (await chrome.runtime.sendMessage({
        type: MSG.AUTH_SIGN_IN,
        payload: { entry: "options" }
      })) as AuthSignInResponse | undefined

      // `cancelled` 是正常路径（用户关窗），静默复位按钮；只有 failed 才提示
      if (!response?.success) {
        setActionError(t("options.account.signInFailed"))
      }
    } catch {
      setActionError(t("options.account.signInFailed"))
    } finally {
      setSigningIn(false)
    }
  }

  const handleSignOut = async () => {
    setConfirmSignOut(false)
    setActionError(null)
    try {
      const response = (await chrome.runtime.sendMessage({
        type: MSG.AUTH_SIGN_OUT
      })) as AuthSignOutResponse | undefined
      if (!response?.success) {
        setActionError(t("options.account.signOutFailed"))
      }
    } catch {
      setActionError(t("options.account.signOutFailed"))
    }
  }

  /**
   * 客户门户（改卡 / 取消 / 发票）。
   *
   * M3 起走 `BILLING_PORTAL_REQUEST` 而不是在 UI 里直接 `chrome.tabs.create`：
   * `manage_url` 优先、拿不到才 `POST /v1/billing/portal`，这层决策（含凭据）只能在 background。
   */
  const handleManageSubscription = () => {
    const fail = () => setActionError(t("options.account.openFailed"))
    setActionError(null)
    void (async () => {
      try {
        const response = (await chrome.runtime.sendMessage({
          type: MSG.BILLING_PORTAL_REQUEST
        })) as BillingPortalResponse | undefined
        if (!response?.success) fail()
      } catch {
        // 扩展上下文失效（重载后遗留的页面）时 sendMessage 也会 reject —— 两路都兜住，
        // 否则就是最典型的「点了没反应」
        fail()
      }
    })()
  }

  // ── 渲染 ────────────────────────────────────────────────

  const renderStatus = () => {
    if (loading) {
      // 快照未就绪：骨架，不画「未登录」（口径 1）
      return (
        <SettingRow title={t("options.account.statusTitle")}>
          <Skeleton style={{ width: 220, height: 20 }} />
        </SettingRow>
      )
    }

    if (!signedIn) {
      return (
        <SettingRow title={t("options.account.statusTitle")} desc={t("options.account.statusGuest")}>
          <div className="opt-account-inline">
            <Button variant="primary" size="sm" disabled={signingIn} onClick={() => void handleSignIn()}>
              {signingIn ? t("options.account.signingIn") : t("options.account.signIn")}
            </Button>
            {actionError ? <Hint warning>{actionError}</Hint> : null}
          </div>
        </SettingRow>
      )
    }

    return (
      <>
        <SettingRow title={t("options.account.statusTitle")}>
          <div className="opt-account-inline">
            <span className="opt-account-email" title={snapshot.email}>
              {snapshot.email ?? t("options.account.emailUnknown")}
            </span>
            <span className="opt-badge">{t(planLabelKey(snapshot.plan))}</span>
            <Button variant="secondary" size="sm" onClick={() => setConfirmSignOut(true)}>
              {t("options.account.signOut")}
            </Button>
          </div>
        </SettingRow>

        <SettingRow title={t("options.account.planTitle")} desc={t("options.account.planDesc")}>
          <div className="opt-account-inline">
            <span className="opt-account-plan">
              <span className="opt-account-plan-name">{t(planLabelKey(snapshot.plan))}</span>
              {entitlements ? (
                <>
                  <span className="opt-account-plan-status">
                    {t(subscriptionStatusKey(entitlements.subscription.status))}
                  </span>
                  <span className="opt-account-plan-end">
                    {entitlements.subscription.periodEnd
                      ? t("options.account.planEnds", [formatDate(entitlements.subscription.periodEnd)])
                      : t("options.account.planNoEnd")}
                  </span>
                </>
              ) : null}
            </span>
            <Button variant="secondary" size="sm" onClick={handleManageSubscription}>
              {manageSubscriptionAction(t).label}
            </Button>
          </div>
          {entitlements?.subscription.status === "past_due" ? (
            <Hint warning>{t("options.account.pastDueHint")}</Hint>
          ) : null}
        </SettingRow>
      </>
    )
  }

  /**
   * 引擎行：**只陈述事实，不提供无效开关**。
   *
   * M1（`OFFICIAL_AI_ENABLED = false`）官方链路未接线，`streamChat` 仍走 BYOK，
   * 而 `resolveActiveProvider` 也会因同一常量直接返回 BYOK。这时渲染一个可点的「官方服务」分段只有两种结果：
   * ① 未登录：写入 `useOfficialService: true` 后立刻被派生回 `byok`（点了没反应 = 静默失败）；
   * ② 已登录：显示「官方服务」而实际请求仍发自 BYOK（显示与实际不符）。
   * 所以 M1 只渲染只读的真实引擎，接线后（常量置 true）自动恢复为分段控件。
   */
  const activeByok = getActiveProvider(settings)
  const officialReady = signedIn || snapshot.state === "anonymous"
  const engineValue: EngineChoice =
    resolveActiveProvider(settings, snapshot)?.kind === "official" ? "official" : "byok"

  const engineRow = OFFICIAL_AI_ENABLED ? (
    <SettingRow
      title={t("options.account.engineTitle")}
      desc={officialReady ? t("options.account.engineDesc") : t("options.account.engineOfficialLocked")}>
      <SegmentedControl
        value={engineValue}
        ariaLabel={t("options.account.engineTitle")}
        options={[
          { value: "official" as const, label: t("options.account.engineOfficial") },
          { value: "byok" as const, label: t("options.account.engineByok") }
        ]}
        onValueChange={(value) => {
          // 未登录时点「官方服务」不是静默回弹，而是直接拉起登录（解锁这个选项的唯一途径）
          if (value === "official" && !officialReady) {
            void handleSignIn()
            return
          }
          setActionError(null)
          saveSettingsNow((current) => ({ ...current, useOfficialService: value === "official" }))
        }}
      />
    </SettingRow>
  ) : (
    <SettingRow title={t("options.account.engineTitle")} desc={t("options.account.engineComingSoon")}>
      <div className="opt-account-inline">
        <span className="opt-account-plan-name">{t("options.account.engineByok")}</span>
        <span className="opt-account-plan-status">
          {activeByok?.name || t("options.account.engineByokMissing")}
        </span>
      </div>
    </SettingRow>
  )

  /** 结算确认到新档位后的回调：重拉一次权益（到期日 / 订阅状态） */
  const handleUpgraded = useCallback(() => {
    void refreshEntitlements(true)
  }, [refreshEntitlements])

  /**
   * 官方模型选择（M3，契约 §5.1）：白名单由 background 下发，**已按当前档位过滤**——
   * 客户端不写死模型名，也不自己算「哪个档能用哪个模型」（那份推导只能出现在一处）。
   */
  const modelRow =
    OFFICIAL_AI_ENABLED && hasPrincipal ? (
      <OfficialModelRow
        value={settings.officialModel}
        plan={snapshot.plan}
        onSelect={(model) => {
          saveSettingsNow((current) => ({ ...current, officialModel: model }))
          void trackEvent("model_selected", {
            provider_type: "official",
            source_list: "fetched",
            model,
            source: "options"
          })
        }}
      />
    ) : null

  return (
    <>
      <SectionCard title={t("options.account.cardTitle")} description={t("options.account.cardDesc")}>
        <FieldGroup>
          {renderStatus()}
          {hasPrincipal ? (
            <UsageRow
              percent={snapshot.quota ? Math.round(snapshot.quota.usedRatio * 100) : null}
              resetAt={snapshot.quota?.resetAt ? formatDate(snapshot.quota.resetAt) : null}
              failed={entitlementsFailed}
            />
          ) : null}
          {engineRow}
          {modelRow}
        </FieldGroup>
      </SectionCard>

      {hasPrincipal ? (
        <SubscriptionCard
          plan={snapshot.plan}
          signedIn={signedIn}
          onRequireSignIn={() => void handleSignIn()}
          onManage={handleManageSubscription}
          onUpgraded={handleUpgraded}
        />
      ) : null}

      <UsageTrendCard enabled={hasPrincipal} />

      {confirmSignOut ? (
        <ConfirmDialog
          title={t("options.account.signOutConfirmTitle")}
          message={t("options.account.signOutConfirmMessage")}
          confirmLabel={t("options.account.signOut")}
          cancelLabel={t("options.account.cancel")}
          onConfirm={() => void handleSignOut()}
          onCancel={() => setConfirmSignOut(false)}
        />
      ) : null}
    </>
  )
}

interface OfficialModelRowProps {
  /** 用户已选的模型（可能为空 = 跟随服务端默认） */
  value?: string
  plan: PlanId
  onSelect: (model: string) => void
}

/**
 * 官方模型选择行。
 *
 * 两个口径：
 * - **模型列表拿不到 ≠ 没有模型**：拉失败就不画下拉（引导用户去填 API Key 是错的）；
 * - 当前值不在列表里（降档后原模型不可用）时显示 **background 解析出的实际生效模型**，
 *   而不是把下拉停在空选项上——用户看到的必须是真正在发请求的那个模型。
 */
function OfficialModelRow({ value, plan, onSelect }: OfficialModelRowProps) {
  const { t } = useI18n()
  const [models, setModels] = useState<OfficialModel[] | null>(null)
  const [resolved, setResolved] = useState("")
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    // 档位变了要重拉：白名单的过滤在 background 侧做（按当前 plan）
    setLoaded(false)
    void (async () => {
      try {
        const response = (await chrome.runtime.sendMessage({
          type: MSG.OFFICIAL_MODELS_REQUEST
        })) as OfficialModelsResponse | undefined
        if (!alive) return
        setModels(response?.models ?? null)
        setResolved(response?.officialModel ?? "")
      } catch {
        if (alive) {
          setModels(null)
          setResolved("")
        }
      } finally {
        if (alive) setLoaded(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [plan])

  const options = (models ?? []).map((model) => ({ value: model.id, label: model.name }))
  const known = value && options.some((option) => option.value === value)
  const current = known ? (value as string) : resolved || options[0]?.value || ""

  if (!loaded) {
    return (
      <SettingRow title={t("options.account.modelTitle")} desc={t("options.account.modelDesc")}>
        <Skeleton style={{ width: 180, height: 32 }} />
      </SettingRow>
    )
  }

  if (options.length === 0) {
    return (
      <SettingRow title={t("options.account.modelTitle")} desc={t("options.account.modelUnavailable")}>
        <span className="opt-account-plan-name">{DEFAULT_OFFICIAL_MODEL}</span>
      </SettingRow>
    )
  }

  return (
    <SettingRow title={t("options.account.modelTitle")} desc={t("options.account.modelDesc")}>
      <SelectField value={current} options={options} ariaLabel={t("options.account.modelTitle")} onValueChange={onSelect} />
    </SettingRow>
  )
}

interface UsageRowProps {
  percent: number | null
  resetAt: string | null
  failed: boolean
}

/**
 * 用量行：`snapshot.quota` 为空（还没拿到）时**不画 0%**——未知与「用完」是两种状态。
 * 失败只给一行提示，不把进度条清空（上一次的成功值仍然比空白有用）。
 */
function UsageRow({ percent, resetAt, failed }: UsageRowProps) {
  const { t } = useI18n()

  return (
    <SettingRow title={t("options.account.usageTitle")} desc={t("options.account.usageDesc")} width="wide">
      <div className="opt-usage">
        {percent === null ? (
          <div className="opt-usage-meta">{t("options.account.usageUnknown")}</div>
        ) : (
          <>
            <div
              className="opt-usage-bar"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("options.account.usageTitle")}>
              <div className="opt-usage-fill" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
            </div>
            <div className="opt-usage-meta">
              <span>{t("options.account.usagePercent", [String(percent)])}</span>
              {resetAt ? <span>{t("options.account.usageReset", [resetAt])}</span> : null}
            </div>
          </>
        )}
        {failed ? <Hint warning>{t("options.account.usageUnavailable")}</Hint> : null}
      </div>
    </SettingRow>
  )
}
