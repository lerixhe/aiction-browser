import type { ReactNode } from "react"
import { I18nProvider } from "@/shared/i18n/context"
import { useI18nLocale } from "@/shared/i18n/useI18nLocale"

export function I18nRoot({ children }: { children: ReactNode }) {
  const locale = useI18nLocale()
  return <I18nProvider locale={locale}>{children}</I18nProvider>
}
