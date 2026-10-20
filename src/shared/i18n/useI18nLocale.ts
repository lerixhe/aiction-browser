import { useEffect, useState } from "react"
import { getSettings } from "@/shared/storage"
import { i18nStore } from "@/shared/i18n/index"
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  normalizeLanguagePreference,
  preferenceToLocale
} from "@/shared/i18n/preference"
import type { Locale } from "@/shared/i18n/registry"

function resolveLocaleForPreference(value: unknown): Locale {
  return preferenceToLocale(normalizeLanguagePreference(value) ?? DEFAULT_LANGUAGE_PREFERENCE)
}

export function useI18nLocale(): Locale {
  const [locale, setLocale] = useState<Locale>(() => {
    const initial = resolveLocaleForPreference(DEFAULT_LANGUAGE_PREFERENCE)
    i18nStore.setLocale(initial)
    return initial
  })

  useEffect(() => {
    void getSettings().then((settings) => {
      const resolved = resolveLocaleForPreference(settings.language)
      setLocale(resolved)
      i18nStore.setLocale(resolved)
    })

    const onChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area !== "sync") return
      const raw = changes["aiction:settings"]
      if (!raw?.newValue) return
      // 直接读存储原文（可能还是旧值 "system"），统一走 normalize
      const settings = raw.newValue as { language?: unknown }
      const resolved = resolveLocaleForPreference(settings.language)
      setLocale(resolved)
      i18nStore.setLocale(resolved)
    }

    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])

  return locale
}
