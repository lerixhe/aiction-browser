/**
 * background 的 i18n 初始化。
 *
 * 为什么必须有它：`i18nStore` 的默认 locale 是 `en`，而 React 侧的 `I18nRoot` 只覆盖
 * content / options / popup。background 生成的文案也走同一个 store：
 * - `ERROR_MESSAGES.*`（noApiKey / requestFailed / requestTimeout …，经 `ChatStreamFailedEvent`
 *   送到面板与 popup）；
 * - 右键菜单标题（`background.openPdfWithAIction`）。
 *
 * 不初始化就永远是英文——非英语用户看到的是「英文错误 + 中文按钮」，且很难从报障里发现。
 *
 * 口径与 UI 完全一致：跟随 `settings.language`（`"browser"` = 浏览器 UI 语言），
 * 解析链复用 `resolveLocalePreference()`。
 */
import { getSettings } from "@/shared/storage"
import { i18nStore } from "@/shared/i18n/index"
import { resolveLocalePreference } from "@/shared/i18n/preference"
import type { Locale } from "@/shared/i18n/registry"

const SETTINGS_KEY = "aiction:settings"

export interface BackgroundI18nOptions {
  /** locale 真的发生变化时回调（首次初始化不触发）：用于重建右键菜单这类一次性文案 */
  onLocaleChange?: (locale: Locale) => void
}

/**
 * 初始化 background 的 locale，并跟随 `settings.language` 的后续变化。
 *
 * 返回的 promise 在**首次** setLocale 完成后 resolve——需要正确语言的一次性初始化
 * （如 `contextMenus.create` 的标题）应该等它，否则会拿到默认英文。
 */
export async function initBackgroundI18n(options: BackgroundI18nOptions = {}): Promise<Locale> {
  let firstApply = true
  let current: Locale = i18nStore.getLocale()

  const apply = (value: unknown): void => {
    const next = resolveLocalePreference(value)
    const previous = current
    current = next
    i18nStore.setLocale(next)

    if (firstApply) {
      // 首次初始化只是「追上设置」，不算变化：此时调用方还没建菜单，不需要重建
      firstApply = false
      return
    }
    if (previous !== next) {
      options.onLocaleChange?.(next)
    }
  }

  try {
    const settings = await getSettings()
    apply(settings.language)
  } catch {
    // 读设置失败（扩展上下文刚起来）：退回默认偏好（跟随浏览器），不要卡住初始化
    apply(undefined)
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return
      const raw = changes[SETTINGS_KEY]
      if (!raw?.newValue) return
      apply((raw.newValue as { language?: unknown }).language)
    })
  } catch {
    // 没有 storage 事件（极少见）只是不跟随变化，初始化本身仍然完成了
  }

  return current
}
