export type UiThemeName = "light" | "dark"

export interface UiTheme {
  bg: {
    page: string
    surface: string
    surfaceAlt: string
    surfaceMuted: string
    overlay: string
    glass: string
  }
  text: {
    primary: string
    secondary: string
    inverse: string
  }
  border: {
    default: string
    strong: string
    subtle: string
    hairline: string
  }
  brand: {
    primary: string
    primaryHover: string
    primaryActive: string
    secondary: string
    secondaryHover: string
  }
  accent: {
    primary: string
    primaryHover: string
    primaryActive: string
  }
  state: {
    error: string
    errorBg: string
    warning: string
    warningBg: string
    success: string
    successBg: string
    disabled: string
  }
}

export const uiThemes: Record<UiThemeName, UiTheme> = {
  light: {
    bg: {
      page: "#F8F9FA",
      surface: "#FFFFFF",
      surfaceAlt: "#F8F9FA",
      surfaceMuted: "#F1F3F5",
      overlay: "rgba(0, 0, 0, 0.45)",
      glass: "rgba(255, 255, 255, 0.78)"
    },
    text: {
      primary: "#1A1A2E",
      secondary: "#6B7280",
      inverse: "#FFFFFF"
    },
    border: {
      default: "#E5E7EB",
      strong: "#1A1A2E",
      subtle: "#F3F4F6",
      hairline: "rgba(0, 0, 0, 0.06)"
    },
    brand: {
      primary: "#0D9488",
      primaryHover: "#0F766E",
      primaryActive: "#115E59",
      secondary: "#E0F5F0",
      secondaryHover: "#CCEBEB"
    },
    accent: {
      primary: "#3B82F6",
      primaryHover: "#2563EB",
      primaryActive: "#1D4ED8"
    },
    state: {
      error: "#EF4444",
      errorBg: "#FEF2F2",
      warning: "#F59E0B",
      warningBg: "#FFFBEB",
      success: "#10B981",
      successBg: "#ECFDF5",
      disabled: "#9CA3AF"
    }
  },
  dark: {
    bg: {
      page: "#0F0F23",
      surface: "#1A1A2E",
      surfaceAlt: "#0F0F23",
      surfaceMuted: "#25253D",
      overlay: "rgba(0, 0, 0, 0.65)",
      glass: "rgba(26, 26, 46, 0.82)"
    },
    text: {
      primary: "#F1F5F9",
      secondary: "#94A3B8",
      inverse: "#0F0F23"
    },
    border: {
      default: "#334155",
      strong: "#F1F5F9",
      subtle: "#1E293B",
      hairline: "rgba(255, 255, 255, 0.06)"
    },
    brand: {
      primary: "#2DD4BF",
      primaryHover: "#14B8A6",
      primaryActive: "#0D9488",
      secondary: "#1A3A35",
      secondaryHover: "#1F4A44"
    },
    accent: {
      primary: "#60A5FA",
      primaryHover: "#93C5FD",
      primaryActive: "#3B82F6"
    },
    state: {
      error: "#F87171",
      errorBg: "#2A0F0F",
      warning: "#FBBF24",
      warningBg: "#2A1F0A",
      success: "#34D399",
      successBg: "#0A2A1A",
      disabled: "#64748B"
    }
  }
}

export const uiTypography = {
  fontFamily: '"SF Pro Text", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif',
  fontFamilyDisplay: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif',
  fontFamilyMono: '"SF Mono", "Fira Code", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
  fontSize: {
    xs: 12,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 19,
    xxl: 23,
    title: 29
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700
  },
  letterSpacing: {
    tight: "-0.022em",
    normal: "0em",
    wide: "0.025em"
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.65
  }
} as const

export const uiSpace = {
  2: 2,
  4: 4,
  6: 6,
  8: 8,
  10: 10,
  12: 12,
  14: 14,
  16: 16,
  20: 20,
  24: 24,
  28: 28,
  32: 32
} as const

export const uiRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999
} as const

export const uiShadow = {
  sm: "0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -1px rgba(0, 0, 0, 0.04)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
} as const

export const uiMotion = {
  durationFast: "150ms",
  durationNormal: "220ms",
  durationExpanded: "300ms",
  durationSlow: "350ms",
  durationSlower: "500ms",
  easingStandard: "cubic-bezier(0.25, 0.1, 0.25, 1.0)",
  easingSpring: "cubic-bezier(0.34, 1.56, 0.64, 1.0)",
  easingSpringGentle: "cubic-bezier(0.22, 1.2, 0.36, 1)",
  easingDecelerate: "cubic-bezier(0, 0, 0.2, 1)",
  easingAccelerate: "cubic-bezier(0.4, 0, 1, 1)",
  easingBounce: "cubic-bezier(0.68, -0.55, 0.265, 1.55)"
} as const

export const uiLayer = {
  overlay: 2147483647
} as const

export const uiLayout = {
  edgeInset: 8,
  toolbar: {
    yOffset: 56,
    preferredXOffset: 160,
    widthEstimate: 420,
    inputMinWidth: 160
  },
  chatPanel: {
    width: 420,
    height: 360,
    initialX: 24,
    initialY: 24
  }
} as const
