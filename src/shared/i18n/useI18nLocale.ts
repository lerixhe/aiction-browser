import { useEffect, useState } from "react"
import { getSettings } from "@/shared/storage"
import { i18nStore } from "@/shared/i18n/index"
import { DEFAULT_LANGUAGE_PREFERENCE, resolveLocalePreference } from "@/shared/i18n/preference"
import type { Locale } from "@/shared/i18n/registry"

export function useI18nLocale(): Locale {
  const [locale, setLocale] = useState<Locale>(() => {
    const initial = resolveLocalePreference(DEFAULT_LANGUAGE_PREFERENCE)
    i18nStore.setLocale(initial)
    return initial
  })

  useEffect(() => {
    void getSettings().then((settings) => {
      const resolved = resolveLocalePreference(settings.language)
      setLocale(resolved)
      i18nStore.setLocale(resolved)
    })

    const onChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area !== "sync") return
      const raw = changes["aiction:settings"]
      if (!raw?.newValue) return
      // 直接读存储原文（可能还是旧值 "system"），统一走 normalize
      const settings = raw.newValue as { language?: unknown }
      const resolved = resolveLocalePreference(settings.language)
      setLocale(resolved)
      i18nStore.setLocale(resolved)
    }

    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])

  return locale
}
