import { useUiTheme } from "@/shared/ui/theme"

/** 笑脸动画样式（keyframes 在 shadow root 内全局生效；多处输出同名规则无害，后者覆盖前者内容相同） */
const SMILEY_CSS = `
  @keyframes smiley-blink {
    0%, 91%, 100% { transform: scaleY(1); }
    94%, 96.5% { transform: scaleY(0.08); }
  }
  @keyframes smiley-bob {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    28% { transform: translateY(-0.7px) rotate(-3deg); }
    62% { transform: translateY(0.5px) rotate(2.2deg); }
  }
  .aiction-smiley-eyes {
    transform-box: fill-box;
    transform-origin: center;
    animation: smiley-blink 4.2s ease-in-out infinite;
  }
  .aiction-smiley-body {
    transform-box: fill-box;
    transform-origin: center;
    animation: smiley-bob 3.4s ease-in-out infinite;
  }
`

interface Props {
  size?: number
  color?: string
  /** 关闭摇摆/眨眼（小尺寸圆点内只保留静态轮廓） */
  animated?: boolean
}

/**
 * 灵动岛 idle 态的笑脸：轻微摇摆 + 定期眨眼，传达「待命」的活质感。
 */
export default function SmileyFace({ size = 18, color, animated = true }: Props) {
  const theme = useUiTheme()
  const stroke = color ?? theme.brand.primary

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {animated ? <style>{SMILEY_CSS}</style> : null}
      <g className={animated ? "aiction-smiley-body" : undefined}>
        <circle cx="12" cy="12" r="9.1" stroke={stroke} strokeWidth="1.7" />
        <g className={animated ? "aiction-smiley-eyes" : undefined}>
          <circle cx="8.7" cy="10.1" r="1.15" fill={stroke} />
          <circle cx="15.3" cy="10.1" r="1.15" fill={stroke} />
        </g>
        <path
          d="M8 13.9c1.05 1.5 2.4 2.3 4 2.3s2.95-.8 4-2.3"
          stroke={stroke}
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
