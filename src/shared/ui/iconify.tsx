import { Icon, addIcon } from "@iconify/react/offline"
import type { CSSProperties } from "react"
import { ICON_DATA } from "./icon-library"

// Register all icons for offline use
Object.entries(ICON_DATA).forEach(([name, data]) => {
  addIcon(name, data)
})

const IconifyIcon = Icon as React.ComponentType<{
  icon: string
  width?: number | string
  height?: number | string
  style?: CSSProperties
  color?: string
  className?: string
}>

export function NavIcon({ icon, size, color }: { icon: string; size: number; color: string }) {
  return <IconifyIcon icon={icon} width={size} height={size} style={{ color }} />
}

export function ActionIcon({ icon, size, color }: { icon: string; size: number; color: string }) {
  return <IconifyIcon icon={icon} width={size} height={size} style={{ color }} />
}
