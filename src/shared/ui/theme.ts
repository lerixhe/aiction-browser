import { useEffect, useState } from "react"

import { getSettings } from "~/shared/storage"
import { type UiThemeName, uiThemes } from "~/shared/ui/tokens"
import type { ThemePreference } from "~/shared/types"

function getSystemThemeName(): UiThemeName {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light"
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function resolveThemeName(preference: ThemePreference): UiThemeName {
  if (preference === "auto") {
    return getSystemThemeName()
  }

  return preference
}

export function useUiThemeName(): UiThemeName {
  const [themeName, setThemeName] = useState<UiThemeName>(() => getSystemThemeName())

  useEffect(() => {
    let preference: ThemePreference = "auto"

    const apply = () => {
      setThemeName(resolveThemeName(preference))
    }

    void getSettings().then((settings) => {
      preference = settings.theme
      apply()
    })

    const mediaQuery =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null

    const onSystemThemeChange = () => {
      if (preference === "auto") {
        apply()
      }
    }

    mediaQuery?.addEventListener("change", onSystemThemeChange)

    const onStorageChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (_changes, areaName) => {
      if (areaName !== "sync") {
        return
      }

      void getSettings().then((settings) => {
        preference = settings.theme
        apply()
      })
    }

    try {
      chrome.storage.onChanged.addListener(onStorageChanged)
    } catch {
      // Extension context may have been invalidated
    }

    return () => {
      mediaQuery?.removeEventListener("change", onSystemThemeChange)
      try {
        chrome.storage.onChanged.removeListener(onStorageChanged)
      } catch {
        // Extension context may have been invalidated
      }
    }
  }, [])

  return themeName
}

export function useUiTheme() {
  const themeName = useUiThemeName()
  return uiThemes[themeName]
}
