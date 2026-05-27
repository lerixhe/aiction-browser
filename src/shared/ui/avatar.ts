export function getServiceInitial(name: string | undefined) {
  const trimmed = name?.trim() ?? ""
  if (!trimmed) {
    return "?"
  }
  return trimmed[0]!.toLocaleUpperCase()
}

export function getAvatarDisplayText(iconText: string | undefined, serviceName: string | undefined) {
  const custom = iconText?.trim() ?? ""
  if (custom) {
    return custom.slice(0, 4)
  }
  return getServiceInitial(serviceName)
}

export function hashString(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i)
    hash = (hash * 131 + char * (i + 1) + char * char) | 0
  }
  return Math.abs(hash)
}

export function getAvatarPalette(iconText: string | undefined, serviceName: string | undefined, dark: boolean) {
  const seed = iconText?.trim() || serviceName?.trim() || "service"
  const hue = hashString(seed) % 360
  return dark
    ? {
      background: `hsl(${hue} 48% 30%)`,
      color: "#f8fafc"
    }
    : {
      background: `hsl(${hue} 78% 94%)`,
      color: `hsl(${hue} 48% 32%)`
    }
}
