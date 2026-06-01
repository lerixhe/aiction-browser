import { Icon } from "@iconify/react"
import type { CSSProperties } from "react"

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
