import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { i18nStore } from "@/shared/i18n/index"
import type { Locale } from "@/shared/i18n/translations"

interface I18nContextValue {
  t: (key: string, substitutions?: string[]) => string
  locale: Locale
}

const I18nContext = createContext<I18nContextValue>({
  t: (key) => key,
  locale: "en"
})

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [, setTick] = useState(0)

  useEffect(() => {
    i18nStore.setLocale(locale)
  }, [locale])

  useEffect(() => {
    return i18nStore.subscribe(() => setTick((n) => n + 1))
  }, [])

  return (
    <I18nContext.Provider value={{ t: i18nStore.t.bind(i18nStore), locale: i18nStore.getLocale() }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
