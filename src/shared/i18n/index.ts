import type { Locale } from "@/shared/i18n/translations"
import { getMessages, resolveLocale } from "@/shared/i18n/translations"

type Listener = () => void

class I18nStore {
  private locale: Locale = "en"
  private messages: Record<string, string> = getMessages("en")
  private listeners = new Set<Listener>()

  t(key: string, substitutions?: string[]): string {
    let message = this.messages[key] ?? key
    if (substitutions) {
      for (let i = 0; i < substitutions.length; i++) {
        message = message.replace(`$${i + 1}`, substitutions[i])
      }
    }
    return message
  }

  getLocale(): Locale {
    return this.locale
  }

  setLocale(locale: Locale): void {
    if (this.locale === locale) return
    this.locale = locale
    this.messages = getMessages(locale)
    this.notify()
  }

  resolveAndSet(browserLang: string): void {
    this.setLocale(resolveLocale(browserLang))
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

export const i18nStore = new I18nStore()

export function t(key: string, substitutions?: string[]): string {
  return i18nStore.t(key, substitutions)
}
