import { useEffect, useState } from "react"
import { getSettings } from "@/shared/storage"
import { i18nStore } from "@/shared/i18n/index"
import { resolveLocale, type Locale } from "@/shared/i18n/translations"
import type { LanguagePreference } from "@/shared/types"

function preferenceToLocale(pref: LanguagePreference): Locale {
  if (pref === "system") {
    return resolveLocale(navigator.language)
  }
  return pref
}

export function useI18nLocale(): Locale {
  const [locale, setLocale] = useState<Locale>(() => {
    const initial = preferenceToLocale("system")
    i18nStore.setLocale(initial)
    return initial
  })

  useEffect(() => {
    void getSettings().then((settings) => {
      const resolved = preferenceToLocale(settings.language)
      setLocale(resolved)
      i18nStore.setLocale(resolved)
    })

    const onChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area !== "sync") return
      const raw = changes["aiction:settings"]
      if (!raw?.newValue) return
      const settings = raw.newValue as { language?: LanguagePreference }
      const pref = settings.language ?? "system"
      const resolved = preferenceToLocale(pref)
      setLocale(resolved)
      i18nStore.setLocale(resolved)
    }

    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])

  return locale
}
