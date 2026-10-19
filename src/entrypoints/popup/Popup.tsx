import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { getSettings, saveSettings } from "@/shared/storage"
import { OPTIONS_ENTRY_STORAGE_KEY } from "@/shared/constants"
import { requestOpenChatInActiveTab } from "@/shared/messaging"
import { trackEvent } from "@/shared/analytics"
import { isBuiltinActionId } from "@/shared/defaults"
import { providerTypeOf } from "@/shared/provider-type"
import { useUiThemeName } from "@/shared/ui/theme"
import { uiMotion, uiRadius, uiShadow, uiSpace, uiThemes, uiTypography } from "@/shared/ui/tokens"
import { ActionIcon } from "@/shared/ui/iconify"
import { ProviderLogoById } from "@/entrypoints/options/ProviderLogo"
import { ToggleSwitch } from "@/shared/ui/toggle-switch"
import { useI18n } from "@/shared/i18n/context"
import type { ActionTemplate, ExtensionSettings, ProviderConfig } from "@/shared/types"

/**
 * Popup 宽度：比旧版（336）宽 24px，用来容纳「provider 名 + 模型名」两行
 * 与「动作名 + 开关」同行。
 */
const POPUP_WIDTH = 360
/**
 * 动作列表可视高度上限 = 6 行（34 × 6）。
 * 动作再多也内部滚动：popup 总高不随动作数量增长（Chrome popup 上限 600px）。
 */
const ACTION_LIST_MAX_HEIGHT = 204
/** 动作数超过这个值才出现「全部 / 已启用」筛选条（少的时候筛选只是噪音） */
const ACTION_FILTER_THRESHOLD = 6
/** provider 下拉浮层的最大高度（旧版是 36 × 2 + 16 + 8 = 88px，只够两行） */
const PROVIDER_MENU_MAX_HEIGHT = 248

// ---------- 图标（自绘，离线可用；动作图标走 ActionIcon 的 iconify 集合） ----------

function ChevronIcon({ color, expanded, size = 14 }: { color: string; expanded: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{
        display: "block",
        transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
        transition: `transform ${uiMotion.durationFast} ${uiMotion.easingStandard}`
      }}>
      <path
        d="m6 9l6 6l6-6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SparklesIcon({ color, size = 13 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <path
        d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2m0-12a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2M9 18a6 6 0 0 1 6-6a6 6 0 0 1-6-6a6 6 0 0 1-6 6a6 6 0 0 1 6 6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MessageIcon({ color, size = 15 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <path
        d="m3 20l1.3-3.9C1.976 12.663 2.874 8.228 6.4 5.726c3.526-2.501 8.59-2.296 11.845.48c3.255 2.777 3.695 7.266 1.029 10.501S11.659 20.922 7.7 19z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PlusIcon({ color, size = 15 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <path d="M12 5v14m-7-7h14" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AlertIcon({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <path
        d="M12 9v4m0 4h.01M10.24 3.9L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.76 3.9a2 2 0 0 0-3.52 0z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SettingsIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <path
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37c1 .608 2.296.07 2.572-1.065"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2" />
    </svg>
  )
}

/** 搜索镜（动作筛选空态用） */
function SearchIcon({ color, size = 15 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <path
        d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0-14 0m18 11l-6-6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function Popup() {
  const themeName = useUiThemeName()
  const theme = uiThemes[themeName]
  const { t } = useI18n()
  const [settings, setSettings] = useState<ExtensionSettings | null>(null)
  /** provider 下拉浮层是否展开（点外关闭；与动作列表互不遮挡） */
  const [providerMenuOpen, setProviderMenuOpen] = useState(false)
  /** 动作筛选：动作很多时用来快速确认「实际开着哪些」 */
  const [actionFilter, setActionFilter] = useState<"all" | "on">("all")
  const [hovered, setHovered] = useState<string | null>(null)
  /** 「在当前页面提问」失败提示（页面没有 content script 时） */
  const [askFailed, setAskFailed] = useState(false)
  const providerMenuRef = useRef<HTMLDivElement | null>(null)

  const providers = settings?.providers ?? []
  const actions = settings?.actions ?? []
  const activeProvider = providers.find((provider) => provider.id === settings?.activeProviderId) ?? null
  const enabledCount = actions.filter((action) => action.enabled !== false).length
  const showFilter = actions.length > ACTION_FILTER_THRESHOLD
  const visibleActions = useMemo(
    () => (actionFilter === "on" ? actions.filter((action) => action.enabled !== false) : actions),
    [actionFilter, actions]
  )

  /**
   * 引擎警告：与 background 的失败判定保持一致（缺 key 一定 no_api_key，缺 model 请求必失败）。
   * 提前在 popup 里暴露，而不是让用户第一次划词才知道。
   */
  const providerWarnKey = !activeProvider
    ? null
    : !activeProvider.apiKey?.trim()
      ? "popup.missingApiKey"
      : !activeProvider.model?.trim()
        ? "popup.missingModel"
        : null

  useEffect(() => {
    void trackEvent("popup_opened", { source: "popup" })
  }, [])

  useEffect(() => {
    document.documentElement.style.margin = "0"
    document.documentElement.style.padding = "0"
    document.documentElement.style.height = "auto"
    document.documentElement.style.overflow = "visible"
    document.documentElement.style.background = theme.bg.page
    document.body.style.margin = "0"
    document.body.style.padding = "0"
    document.body.style.minWidth = `${POPUP_WIDTH}px`
    document.body.style.height = "auto"
    document.body.style.overflow = "hidden"
    document.body.style.background = theme.bg.page
  }, [theme.bg.page])

  useEffect(() => {
    void getSettings().then(setSettings)

    const onStorageChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
      _changes,
      areaName
    ) => {
      if (areaName !== "sync") {
        return
      }
      void getSettings().then(setSettings)
    }

    try {
      chrome.storage.onChanged.addListener(onStorageChanged)
    } catch {
      // Extension context may have been invalidated
    }

    return () => {
      try {
        chrome.storage.onChanged.removeListener(onStorageChanged)
      } catch {
        // Extension context may have been invalidated
      }
    }
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!providerMenuRef.current?.contains(event.target as Node)) {
        setProviderMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handlePointerDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
    }
  }, [])

  const handleProviderChange = async (providerId: string) => {
    if (!settings || providerId === settings.activeProviderId) {
      return
    }
    const fromProvider = providers.find((p) => p.id === settings.activeProviderId)
    const toProvider = providers.find((p) => p.id === providerId)
    const nextSettings = { ...settings, activeProviderId: providerId }
    setSettings(nextSettings)
    setProviderMenuOpen(false)
    // 上报放在落盘之前：popup 随时关闭，await 之后的事件会丢（与 options 侧同一事件名）
    void trackEvent("provider_switched", {
      from_provider_type: providerTypeOf(fromProvider),
      to_provider_type: providerTypeOf(toProvider),
      source: "popup"
    })
    await saveSettings(nextSettings)
  }

  const handleActionToggle = useCallback(
    async (actionId: string) => {
      if (!settings) return
      const nextEnabled = settings.actions.find((a) => a.id === actionId)?.enabled === false
      const nextActions = settings.actions.map((a) =>
        a.id === actionId ? { ...a, enabled: a.enabled === false ? true : false } : a
      )
      const nextSettings = { ...settings, actions: nextActions }
      setSettings(nextSettings)
      // 上报放在落盘之前：popup 可能随时关闭，await 之后的事件会丢
      void trackEvent("action_enabled_toggled", {
        scope: "popup",
        enabled: nextEnabled,
        is_custom: !isBuiltinActionId(actionId),
        source: "popup"
      })
      await saveSettings(nextSettings)
    },
    [settings]
  )

  /**
   * 「在当前页面提问」：让 content script 开一个空的聊天态面板并聚焦输入框。
   * 成功即关闭 popup（把系统焦点还给页面，面板那边延时聚焦才落得到输入框上）；
   * 失败（chrome:// / 商店页 / 未刷新的旧标签页没有 content script）留在 popup 上显式提示，
   * 不静默失败。
   */
  const handleAsk = async () => {
    setAskFailed(false)
    try {
      await requestOpenChatInActiveTab()
      // 与 provider_switched 同一取舍：popup 关闭会取消未完成的上报，事件仍放在关之前发
      void trackEvent("popup_ask_clicked", { result: "opened", source: "popup" })
      window.close()
    } catch {
      void trackEvent("popup_ask_clicked", { result: "unsupported", source: "popup" })
      setAskFailed(true)
    }
  }

  const openOptionsPage = async () => {
    // 先写入入口标记（供 options 页上报 options_opened.entry 后清除）；
    // 必须 await —— window.close() 会取消未完成的 storage 写入
    try {
      await chrome.storage.local.set({ [OPTIONS_ENTRY_STORAGE_KEY]: "popup" })
    } catch {
      // Extension context may have been invalidated
    }
    void chrome.runtime.openOptionsPage()
    window.close()
  }

  // ---------- 样式 ----------
  // 深色下 warning 本身足够亮；浅色下 #F59E0B 在白底上对比度不足，文字换深一档
  const warnTextColor = themeName === "dark" ? theme.state.warning : "#B45309"
  const warnBorderColor = `${theme.state.warning}66`

  const shellStyle: CSSProperties = {
    width: POPUP_WIDTH,
    boxSizing: "border-box",
    padding: uiSpace[14],
    background: theme.bg.page,
    color: theme.text.primary,
    fontFamily: uiTypography.fontFamily,
    display: "flex",
    flexDirection: "column"
  }

  const headStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: uiSpace[8],
    paddingBottom: uiSpace[12]
  }

  const brandMarkStyle: CSSProperties = {
    width: 22,
    height: 22,
    borderRadius: 7,
    background: `linear-gradient(135deg, ${theme.accent.primary}, ${theme.accent.primaryHover})`,
    color: theme.text.inverse,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0
  }

  const brandNameStyle: CSSProperties = {
    fontSize: 13.5,
    fontWeight: uiTypography.fontWeight.semibold,
    letterSpacing: uiTypography.letterSpacing.tight
  }

  const versionStyle: CSSProperties = {
    fontSize: 10,
    fontWeight: uiTypography.fontWeight.semibold,
    color: theme.text.secondary,
    background: theme.bg.surfaceMuted,
    padding: "1px 6px",
    borderRadius: uiRadius.pill,
    fontFamily: uiTypography.fontFamilyMono
  }

  const labelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: uiTypography.fontWeight.semibold,
    letterSpacing: "0.02em",
    color: theme.text.secondary,
    marginBottom: 7
  }

  const engineTriggerStyle = (open: boolean): CSSProperties => ({
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: uiSpace[10],
    padding: `8px ${uiSpace[10]}px`,
    borderRadius: 10,
    background: theme.bg.surface,
    border: `1px solid ${
      providerWarnKey ? warnBorderColor : open ? theme.accent.primary : theme.border.default
    }`,
    boxShadow: uiShadow.sm,
    cursor: "pointer",
    fontFamily: uiTypography.fontFamily,
    textAlign: "left",
    transition: `border-color ${uiMotion.durationFast} ${uiMotion.easingStandard}`
  })

  const engineTextStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 1
  }

  const engineNameStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: uiTypography.fontWeight.semibold,
    lineHeight: 1.3,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  }

  const engineModelStyle: CSSProperties = {
    fontSize: 11,
    lineHeight: 1.3,
    color: theme.text.secondary,
    fontFamily: uiTypography.fontFamilyMono,
    whiteSpace: "nowrap",
    overflow: "hidden",
    // 长模型名右端渐隐（不用省略号：省略号是硬截断符号、位置还随名字长度跳动）
    maskImage: "linear-gradient(90deg, #000 calc(100% - 26px), transparent)",
    WebkitMaskImage: "linear-gradient(90deg, #000 calc(100% - 26px), transparent)"
  }

  const warnLineStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: uiSpace[4],
    fontSize: 10.5,
    lineHeight: 1.35,
    color: warnTextColor,
    marginTop: 2
  }

  const menuStyle: CSSProperties = {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    right: 0,
    zIndex: 30,
    padding: uiSpace[4],
    maxHeight: PROVIDER_MENU_MAX_HEIGHT,
    overflowY: "auto",
    borderRadius: uiRadius.xl,
    background: theme.bg.surface,
    border: `1px solid ${theme.border.default}`,
    boxShadow: uiShadow.xl
  }

  const menuItemStyle = (selected: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: "26px 1fr 16px",
    alignItems: "center",
    gap: uiSpace[10],
    width: "100%",
    padding: `7px ${uiSpace[8]}px`,
    border: "none",
    borderRadius: 7,
    background: "transparent",
    color: theme.text.primary,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: uiTypography.fontFamily
  })

  const menuItemNameStyle = (selected: boolean): CSSProperties => ({
    fontSize: 12.5,
    fontWeight: selected ? uiTypography.fontWeight.semibold : uiTypography.fontWeight.medium,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  })

  const emptyCardStyle: CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: uiSpace[10],
    padding: `12px ${uiSpace[10]}px`,
    borderRadius: 10,
    background: "transparent",
    border: `1px dashed ${theme.border.default}`,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: uiTypography.fontFamily
  }

  const emptyPlusStyle: CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: 8,
    flexShrink: 0,
    background: `${theme.accent.primary}1A`,
    color: theme.accent.primary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  }

  const emptyTitleStyle: CSSProperties = {
    display: "block",
    fontSize: 12.5,
    fontWeight: uiTypography.fontWeight.semibold,
    color: theme.text.primary
  }

  const emptyDescStyle: CSSProperties = {
    display: "block",
    fontSize: 11,
    color: theme.text.secondary,
    marginTop: 2
  }

  const askDisabled = !activeProvider
  const askButtonStyle: CSSProperties = {
    width: "100%",
    height: 36,
    marginTop: uiSpace[10],
    borderRadius: 10,
    border: "none",
    background: askDisabled
      ? theme.bg.surfaceMuted
      : hovered === "ask"
        ? theme.accent.primaryHover
        : theme.accent.primary,
    color: askDisabled ? theme.text.secondary : theme.text.inverse,
    fontSize: 12.5,
    fontWeight: uiTypography.fontWeight.semibold,
    fontFamily: uiTypography.fontFamily,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: uiSpace[8],
    cursor: askDisabled ? "not-allowed" : "pointer",
    opacity: askDisabled ? 0.85 : 1,
    transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`
  }

  const askErrorStyle: CSSProperties = {
    marginTop: uiSpace[6],
    fontSize: 11,
    lineHeight: 1.4,
    color: warnTextColor,
    display: "flex",
    alignItems: "center",
    gap: uiSpace[4],
    justifyContent: "center"
  }

  const labelRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiSpace[8],
    marginTop: uiSpace[16],
    marginBottom: 7
  }

  const countStyle: CSSProperties = {
    fontSize: 11,
    color: theme.text.secondary,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap"
  }

  const filterBarStyle: CSSProperties = {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    borderRadius: uiRadius.lg,
    background: theme.bg.surfaceMuted,
    marginBottom: 7
  }

  const filterButtonStyle = (active: boolean): CSSProperties => ({
    border: "none",
    background: active ? theme.bg.surface : "transparent",
    color: active ? theme.text.primary : theme.text.secondary,
    fontFamily: uiTypography.fontFamily,
    fontSize: 11,
    fontWeight: uiTypography.fontWeight.semibold,
    padding: `4px ${uiSpace[10]}px`,
    borderRadius: 6,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    boxShadow: active ? uiShadow.sm : "none"
  })

  const filterCountStyle: CSSProperties = {
    fontSize: 10,
    opacity: 0.75,
    fontVariantNumeric: "tabular-nums"
  }

  const actionListStyle: CSSProperties = {
    position: "relative",
    background: theme.bg.surface,
    border: `1px solid ${theme.border.default}`,
    borderRadius: 10,
    boxShadow: uiShadow.sm,
    overflow: "hidden"
  }

  const actionScrollStyle: CSSProperties = {
    maxHeight: ACTION_LIST_MAX_HEIGHT,
    overflowY: "auto",
    overscrollBehavior: "contain"
  }

  const actionRowStyle = (enabled: boolean, rowHovered: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: `0 ${uiSpace[10]}px`,
    height: 34,
    borderBottom: `1px solid ${theme.border.hairline}`,
    background: rowHovered ? theme.bg.surfaceMuted : "transparent",
    cursor: "pointer",
    transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}`
  })

  const actionIconStyle = (enabled: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    color: enabled ? theme.accent.primary : theme.text.secondary,
    opacity: enabled ? 1 : 0.75,
    flexShrink: 0
  })

  const actionLabelStyle = (enabled: boolean): CSSProperties => ({
    flex: 1,
    fontSize: 12.5,
    color: enabled ? theme.text.primary : theme.text.secondary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  })

  const listEmptyStyle: CSSProperties = {
    padding: "22px 16px",
    textAlign: "center"
  }

  const listEmptyIconStyle: CSSProperties = {
    width: 30,
    height: 30,
    borderRadius: 9,
    margin: "0 auto 9px",
    background: theme.bg.surfaceMuted,
    color: theme.text.secondary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  }

  const listEmptyTitleStyle: CSSProperties = {
    display: "block",
    fontSize: uiTypography.fontSize.xs,
    fontWeight: uiTypography.fontWeight.semibold,
    color: theme.text.primary
  }

  const listEmptyDescStyle: CSSProperties = {
    display: "block",
    fontSize: 11,
    color: theme.text.secondary,
    marginTop: 3,
    lineHeight: 1.5
  }

  const footStyle: CSSProperties = {
    paddingTop: uiSpace[12]
  }

  const secondaryButtonStyle: CSSProperties = {
    width: "100%",
    height: 34,
    borderRadius: 9,
    background: hovered === "settings" ? `${theme.accent.primary}1A` : theme.bg.surfaceMuted,
    border: `1px solid ${
      hovered === "settings" ? `${theme.accent.primary}2E` : theme.border.hairline
    }`,
    color: hovered === "settings" ? theme.accent.primary : theme.text.primary,
    fontFamily: uiTypography.fontFamily,
    fontSize: 12.5,
    fontWeight: uiTypography.fontWeight.semibold,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    cursor: "pointer",
    transition: `background ${uiMotion.durationFast} ${uiMotion.easingStandard}, color ${uiMotion.durationFast} ${uiMotion.easingStandard}, border-color ${uiMotion.durationFast} ${uiMotion.easingStandard}`
  }

  const renderProviderItem = (provider: ProviderConfig) => {
    const selected = provider.id === settings?.activeProviderId
    return (
      <button
        key={provider.id}
        type="button"
        role="option"
        aria-selected={selected}
        onClick={() => {
          void handleProviderChange(provider.id)
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = theme.bg.surfaceMuted
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = "transparent"
        }}
        style={menuItemStyle(selected)}>
        <ProviderLogoById
          providerId={provider.modelsDevId || ""}
          name={provider.name || "Custom"}
          size={26}
          theme={theme}
        />
        <span style={{ minWidth: 0 }}>
          <span style={{ ...menuItemNameStyle(selected), display: "block" }}>
            {provider.name || t("popup.unnamedProvider")}
          </span>
          <span
            style={{
              display: "block",
              fontSize: 10.5,
              color: theme.text.secondary,
              fontFamily: uiTypography.fontFamilyMono,
              marginTop: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}>
            {provider.model || t("popup.missingModel")}
          </span>
        </span>
        <span style={{ color: theme.accent.primary, display: "flex", justifyContent: "center" }}>
          {selected ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m5 12l5 5L20 7"
                stroke={theme.accent.primary}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </span>
      </button>
    )
  }

  const renderActionRow = (action: ActionTemplate) => {
    const enabled = action.enabled !== false
    const rowHovered = hovered === action.id
    return (
      <div
        key={action.id}
        role="switch"
        aria-checked={enabled}
        aria-label={action.label}
        tabIndex={0}
        onClick={() => {
          void handleActionToggle(action.id)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            void handleActionToggle(action.id)
          }
        }}
        onMouseEnter={() => setHovered(action.id)}
        onMouseLeave={() => setHovered(null)}
        style={actionRowStyle(enabled, rowHovered)}>
        <span style={actionIconStyle(enabled)}>
          {action.icon ? (
            <ActionIcon icon={action.icon} size={16} color="currentColor" />
          ) : (
            <SparklesIcon color="currentColor" size={16} />
          )}
        </span>
        <span style={actionLabelStyle(enabled)}>{action.label}</span>
        <ToggleSwitch
          checked={enabled}
          onChange={() => void handleActionToggle(action.id)}
          theme={theme}
          stopPropagation
        />
      </div>
    )
  }

  const renderActionList = () => {
    if (actions.length === 0) {
      return (
        <button type="button" onClick={openOptionsPage} style={emptyCardStyle}>
          <span style={emptyPlusStyle}>
            <PlusIcon color="currentColor" />
          </span>
          <span>
            <span style={emptyTitleStyle}>{t("popup.noActions")}</span>
            <span style={emptyDescStyle}>{t("popup.noActionsDesc")}</span>
          </span>
        </button>
      )
    }

    if (visibleActions.length === 0) {
      return (
        <div style={actionListStyle}>
          <div style={listEmptyStyle}>
            <span style={listEmptyIconStyle}>
              <SearchIcon color="currentColor" />
            </span>
            <span style={listEmptyTitleStyle}>{t("popup.noEnabledActions")}</span>
            <span style={listEmptyDescStyle}>{t("popup.noEnabledActionsDesc")}</span>
          </div>
        </div>
      )
    }

    const scrollable = visibleActions.length > ACTION_FILTER_THRESHOLD
    return (
      <div className={`aiction-popup-list${scrollable ? " scrollable" : ""}`} style={actionListStyle}>
        <div className="aiction-popup-scroll" style={actionScrollStyle}>
          {visibleActions.map(renderActionRow)}
        </div>
      </div>
    )
  }

  return (
    <div style={shellStyle}>
      <style>{`
        .aiction-popup-scroll::-webkit-scrollbar { width: 9px; }
        .aiction-popup-scroll::-webkit-scrollbar-track { background: transparent; }
        .aiction-popup-scroll::-webkit-scrollbar-thumb {
          background: ${theme.border.default};
          border-radius: 99px;
          border: 3px solid transparent;
          background-clip: padding-box;
        }
        .aiction-popup-list.scrollable::after {
          content: "";
          position: absolute;
          left: 1px;
          right: 1px;
          bottom: 1px;
          height: 16px;
          border-radius: 0 0 9px 9px;
          pointer-events: none;
          background: linear-gradient(180deg, transparent, ${theme.bg.surface});
        }
      `}</style>

      {/* 头部：品牌 + 版本 */}
      <div style={headStyle}>
        <span style={brandMarkStyle}>
          <SparklesIcon color={theme.text.inverse} />
        </span>
        <span style={brandNameStyle}>AIction</span>
        <span style={versionStyle}>v{chrome.runtime.getManifest().version}</span>
      </div>

      {/* AI 引擎：当前 provider + 模型（可切换） */}
      <div style={labelStyle}>{t("popup.engine")}</div>
      {activeProvider ? (
        <div ref={providerMenuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setProviderMenuOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={providerMenuOpen}
            style={engineTriggerStyle(providerMenuOpen)}>
            <ProviderLogoById
              providerId={activeProvider.modelsDevId || ""}
              name={activeProvider.name || "Custom"}
              size={28}
              theme={theme}
            />
            <span style={engineTextStyle}>
              <span style={engineNameStyle}>{activeProvider.name || t("popup.unnamedProvider")}</span>
              <span style={engineModelStyle}>{activeProvider.model || t("popup.missingModel")}</span>
              {providerWarnKey ? (
                <span style={warnLineStyle}>
                  <AlertIcon color="currentColor" />
                  {t(providerWarnKey)}
                </span>
              ) : null}
            </span>
            <ChevronIcon color={theme.text.secondary} expanded={providerMenuOpen} />
          </button>

          {providerMenuOpen ? (
            <div role="listbox" className="aiction-popup-scroll" style={menuStyle}>
              {providers.map(renderProviderItem)}
              <div
                style={{
                  borderTop: `1px solid ${theme.border.hairline}`,
                  marginTop: uiSpace[4],
                  paddingTop: uiSpace[4]
                }}>
                <button
                  type="button"
                  onClick={openOptionsPage}
                  style={{ ...menuItemStyle(false), color: theme.text.secondary }}>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: theme.accent.primary
                    }}>
                    <PlusIcon color="currentColor" />
                  </span>
                  <span style={{ ...menuItemNameStyle(false), fontSize: 12 }}>
                    {t("popup.manageProviders")}
                  </span>
                  <span />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <button type="button" onClick={openOptionsPage} style={emptyCardStyle}>
          <span style={emptyPlusStyle}>
            <PlusIcon color="currentColor" />
          </span>
          <span>
            <span style={emptyTitleStyle}>{t("popup.addProvider")}</span>
            <span style={emptyDescStyle}>{t("popup.addProviderDesc")}</span>
          </span>
        </button>
      )}

      {/* 主动作：在当前页面提问（无 provider 时禁用 —— 点开也只会失败） */}
      <button
        type="button"
        onClick={() => void handleAsk()}
        disabled={askDisabled}
        onMouseEnter={() => setHovered("ask")}
        onMouseLeave={() => setHovered(null)}
        style={askButtonStyle}>
        <MessageIcon color="currentColor" />
        {t("popup.askInPage")}
      </button>
      {askFailed ? (
        <div style={askErrorStyle} role="alert">
          <AlertIcon color="currentColor" />
          {t("popup.askUnsupported")}
        </div>
      ) : null}

      {/* 划词动作 */}
      <div style={labelRowStyle}>
        <span style={{ ...labelStyle, marginBottom: 0 }}>{t("popup.actionsTitle")}</span>
        <span style={countStyle}>
          {t("popup.actionsEnabledCount", [String(enabledCount), String(actions.length)])}
        </span>
      </div>

      {showFilter ? (
        <div style={filterBarStyle}>
          <button type="button" onClick={() => setActionFilter("all")} style={filterButtonStyle(actionFilter === "all")}>
            {t("popup.filterAll")}
            <span style={filterCountStyle}>{actions.length}</span>
          </button>
          <button type="button" onClick={() => setActionFilter("on")} style={filterButtonStyle(actionFilter === "on")}>
            {t("popup.filterEnabled")}
            <span style={filterCountStyle}>{enabledCount}</span>
          </button>
        </div>
      ) : null}

      {renderActionList()}

      {/* 底部：设置入口（全屏唯一入口） */}
      <div style={footStyle}>
        <button
          type="button"
          onClick={openOptionsPage}
          onMouseEnter={() => setHovered("settings")}
          onMouseLeave={() => setHovered(null)}
          style={secondaryButtonStyle}>
          <SettingsIcon color="currentColor" />
          {t("popup.openSettings")}
        </button>
      </div>
    </div>
  )
}
