/**
 * background 的 i18n 初始化。
 *
 * 这里的失败模式很隐蔽：不初始化不会报错，只是所有 `ERROR_MESSAGES.*` 悄悄变成英文，
 * 而 UI 侧（React 的 I18nRoot）是中文本地化的——用户看到「英文错误 + 中文按钮」。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { i18nStore } from "@/shared/i18n/index"
import { initBackgroundI18n } from "@/shared/i18n/background"
import type { Locale } from "@/shared/i18n/registry"

type Listener = (changes: Record<string, { newValue?: unknown }>, area: string) => void

interface Stub {
  emit: (language: unknown, area?: string) => void
  listenerCount: () => number
}

const originalChrome = (globalThis as { chrome?: unknown }).chrome

function installStub(options: { language?: unknown; getFails?: boolean } = {}): Stub {
  const settings: Record<string, unknown> =
    options.language === undefined ? {} : { language: options.language }
  const listeners: Listener[] = []

  ;(globalThis as { chrome?: unknown }).chrome = {
    i18n: { getUILanguage: () => "zh-CN" },
    storage: {
      sync: {
        get: async (key: string) => {
          if (options.getFails) throw new Error("storage unavailable")
          return Object.keys(settings).length > 0 ? { [key]: settings } : {}
        },
        set: async () => undefined
      },
      local: {
        get: async () => ({}),
        set: async () => undefined,
        remove: async () => undefined
      },
      onChanged: {
        addListener: (listener: Listener) => listeners.push(listener),
        removeListener: (listener: Listener) => {
          const index = listeners.indexOf(listener)
          if (index >= 0) listeners.splice(index, 1)
        }
      }
    }
  }

  return {
    listenerCount: () => listeners.length,
    emit: (language, area = "sync") => {
      for (const listener of listeners) {
        listener({ "aiction:settings": { newValue: { language } } }, area)
      }
    }
  }
}

beforeEach(() => {
  // i18nStore 是模块级单例：每个用例从英文起步，避免互相污染
  i18nStore.setLocale("en")
})

afterEach(() => {
  ;(globalThis as { chrome?: unknown }).chrome = originalChrome
  i18nStore.setLocale("en")
})

describe("initBackgroundI18n", () => {
  it("无设置时跟随浏览器 UI 语言（不是默认的 en）", async () => {
    installStub()
    await expect(initBackgroundI18n()).resolves.toBe<Locale>("zh_CN")
    expect(i18nStore.getLocale()).toBe("zh_CN")
  })

  it("跟随 settings.language 的显式选择", async () => {
    installStub({ language: "ja" })
    await expect(initBackgroundI18n()).resolves.toBe<Locale>("ja")
  })

  it("历史值 system 迁移为「跟随浏览器」", async () => {
    installStub({ language: "system" })
    await expect(initBackgroundI18n()).resolves.toBe<Locale>("zh_CN")
  })

  it("非法值回退到浏览器语言（不抛错）", async () => {
    installStub({ language: "klingon" })
    await expect(initBackgroundI18n()).resolves.toBe<Locale>("zh_CN")
  })

  it("读设置失败时退回默认偏好，不 reject", async () => {
    installStub({ getFails: true })
    await expect(initBackgroundI18n()).resolves.toBe<Locale>("zh_CN")
  })

  it("首次初始化不触发 onLocaleChange（此时还没有菜单要重建）", async () => {
    installStub({ language: "ja" })
    const changes: Locale[] = []
    await initBackgroundI18n({ onLocaleChange: (locale) => changes.push(locale) })
    expect(changes).toEqual([])
  })

  it("设置里改语言 → 更新 locale 并回调一次", async () => {
    const stub = installStub({ language: "ja" })
    const changes: Locale[] = []
    await initBackgroundI18n({ onLocaleChange: (locale) => changes.push(locale) })

    stub.emit("ko")
    expect(changes).toEqual(["ko"])
    expect(i18nStore.getLocale()).toBe("ko")
  })

  it("语言没变时不回调（避免无谓重建菜单）", async () => {
    const stub = installStub({ language: "ja" })
    const changes: Locale[] = []
    await initBackgroundI18n({ onLocaleChange: (locale) => changes.push(locale) })

    stub.emit("ja")
    expect(changes).toEqual([])
  })

  it("只跟随 sync 区域的变化（local 区域的同名 key 不算）", async () => {
    const stub = installStub({ language: "ja" })
    const changes: Locale[] = []
    await initBackgroundI18n({ onLocaleChange: (locale) => changes.push(locale) })

    stub.emit("ko", "local")
    expect(changes).toEqual([])
    expect(i18nStore.getLocale()).toBe("ja")
  })

  it("注册且只注册一个 storage 监听", async () => {
    const stub = installStub()
    await initBackgroundI18n()
    expect(stub.listenerCount()).toBe(1)
  })

  it("ERROR_MESSAGES 这类 getter 会在 locale 变化后立刻拿到新文案", async () => {
    const stub = installStub({ language: "ja" })
    await initBackgroundI18n()

    const japanese = i18nStore.t("errors.noApiKey")
    stub.emit("en")
    const english = i18nStore.t("errors.noApiKey")

    expect(japanese).not.toBe(english)
    expect(english).toBe("Please set your API Key in Settings first.")
  })
})
