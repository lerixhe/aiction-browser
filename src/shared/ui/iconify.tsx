import { Icon, addCollection } from "@iconify/react"
import type { CSSProperties } from "react"
import { BUNDLED_TABLER_ICONS } from "./bundled-icons"
import { loadAndRegisterUserIcons } from "@/shared/storage"

// Load built-in icons at module init (instant, no network)
addCollection(BUNDLED_TABLER_ICONS)

// Lazy load user icons on first render
let userIconsLoaded = false
let userIconsPromise: Promise<void> | null = null

async function ensureUserIcons() {
  if (userIconsLoaded) return
  if (userIconsPromise) {
    await userIconsPromise
    return
  }
  userIconsPromise = loadAndRegisterUserIcons().then(() => {
    userIconsLoaded = true
  })
  await userIconsPromise
}

const IconifyIcon = Icon as React.ComponentType<{
  icon: string
  width?: number | string
  height?: number | string
  style?: CSSProperties
  color?: string
  className?: string
}>

export function NavIcon({ icon, size, color }: { icon: string; size: number; color: string }) {
  // Trigger lazy load on first render
  if (!userIconsLoaded) {
    ensureUserIcons()
  }
  return <IconifyIcon icon={icon} width={size} height={size} style={{ color }} />
}

export function ActionIcon({ icon, size, color }: { icon: string; size: number; color: string }) {
  // Trigger lazy load on first render
  if (!userIconsLoaded) {
    ensureUserIcons()
  }
  return <IconifyIcon icon={icon} width={size} height={size} style={{ color }} />
}
