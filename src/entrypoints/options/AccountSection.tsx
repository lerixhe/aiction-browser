import { useEffect, useRef, useState } from "react"

import { trackEvent, usedRatioBucket } from "@/shared/analytics"

import { manageSubscriptionAction } from "@/shared/auth/actions"
import { WEB_BASE } from "@/shared/auth/config"
import type {
  AuthSignInResponse,
  AuthSignOutResponse,
  Entitlements,
  EntitlementsResponse
} from "@/shared/auth/types"
import { useAuthSnapshot } from "@/shared/auth/use-auth-snapshot"
import { MESSAGE_TYPES } from "@/shared/constants"
import { useI18n } from "@/shared/i18n/context"
import { parseLocaleTag } from "@/shared/language-tag"
import { resolveActiveProvider } from "@/shared/provider-resolve"
import type { ExtensionSettings } from "@/shared/types"
import { ConfirmDialog } from "./ConfirmDialog"
import { Button, FieldGroup, Hint, SectionCard, SegmentedControl, SettingRow, Skeleton } from "./ui"

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

  // 权益（订阅到期日 / 客户门户链接）：只在进入本分区或登录态变化时强制回源一次。
  // 依赖用 `state` 而不是 `updatedAt`：后者在登录流程里会变两次，白白多打一次 /v1/me。
  useEffect(() => {
    if (!signedIn) {
      setEntitlements(null)
      setEntitlementsFailed(false)
      return
    }

    let alive = true
    void (async () => {
      try {
        const response = (await chrome.runtime.sendMessage({
          type: MSG.ENTITLEMENTS_REQUEST,
          payload: { force: true }
        })) as EntitlementsResponse | undefined
        if (!alive) return
        if (response?.success && response.entitlements) {
          setEntitlements(response.entitlements)
          setEntitlementsFailed(false)
        } else {
          // 失败**不改 plan**：一次 500 不能把 pro 用户显示成 free
          setEntitlementsFailed(true)
        }
      } catch {
        if (alive) setEntitlementsFailed(true)
      }
    })()

    return () => {
      alive = false
    }
  }, [signedIn])

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

  const handleManageSubscription = () => {
    // `manageUrl` 由服务端下发；拿不到时退到账单页（地址始终可点，不静默失败）
    const url = entitlements?.subscription.manageUrl || `${WEB_BASE}/billing`
    void chrome.tabs.create({ url })
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
            <span className="opt-badge">{t(`options.account.plan.${snapshot.plan}`)}</span>
            <Button variant="secondary" size="sm" onClick={() => setConfirmSignOut(true)}>
              {t("options.account.signOut")}
            </Button>
          </div>
        </SettingRow>

        <SettingRow title={t("options.account.planTitle")} desc={t("options.account.planDesc")}>
          <div className="opt-account-inline">
            <span className="opt-account-plan">
              <span className="opt-account-plan-name">{t(`options.account.plan.${snapshot.plan}`)}</span>
              {entitlements ? (
                <>
                  <span className="opt-account-plan-status">
                    {t(`options.account.status.${entitlements.subscription.status}`)}
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

        <UsageRow
          percent={snapshot.quota ? Math.round(snapshot.quota.usedRatio * 100) : null}
          resetAt={snapshot.quota?.resetAt ? formatDate(snapshot.quota.resetAt) : null}
          failed={entitlementsFailed}
        />
      </>
    )
  }

  const resolved = resolveActiveProvider(settings, snapshot)
  const engineValue: EngineChoice = resolved?.kind === "official" ? "official" : "byok"
  const hasByok = settings.providers.some((provider) => provider.kind !== "official")
  const officialReady = signedIn || snapshot.state === "anonymous"

  const engineDesc = (() => {
    if (engineValue === "official" && !officialReady) return t("options.account.engineOfficialLocked")
    if (engineValue === "byok" && !hasByok) return t("options.account.engineByokMissing")
    return t("options.account.engineDesc")
  })()

  return (
    <>
      <SectionCard title={t("options.account.cardTitle")} description={t("options.account.cardDesc")}>
        <FieldGroup>
          {renderStatus()}

          <SettingRow title={t("options.account.engineTitle")} desc={engineDesc}>
            <SegmentedControl
              value={engineValue}
              ariaLabel={t("options.account.engineTitle")}
              options={[
                { value: "official" as const, label: t("options.account.engineOfficial") },
                { value: "byok" as const, label: t("options.account.engineByok") }
              ]}
              onValueChange={(value) => {
                setActionError(null)
                saveSettingsNow((current) => ({ ...current, useOfficialService: value === "official" }))
              }}
            />
          </SettingRow>
        </FieldGroup>
      </SectionCard>

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
