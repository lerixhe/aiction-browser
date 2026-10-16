import { useId } from "react"
import { useUiTheme } from "@/shared/ui/theme"

/**
 * 笑脸动画样式（keyframes 在 shadow root 内全局生效；多处输出同名规则无害，后者覆盖前者内容相同）。
 *
 * 最早的简笔线条设计：描边圆脸 + 两点豆眼 + 线条嘴，全部随主题品牌色，无填充/高光/渐变。
 * 三态编排（同一套简笔笔触）：
 *   idle = 摇摆 + 弹跳合拍（bob，原版节奏）+ 定期眨眼；
 *   thinking = 恒歪头缓摆 + 左点眼右弯眉眼（眺望感）+ 抿嘴微弧 + 右上三粒思考点错拍闪烁；
 *   speaking = 随声快速点头 + O 嘴（线描圆）开合模拟语音。
 */
const SMILEY_CSS = `
  @keyframes smiley-blink {
    0%, 91%, 100% { transform: scaleY(1); }
    94%, 96.5% { transform: scaleY(0.12); }
  }
  @keyframes smiley-bob {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    28% { transform: translateY(-0.7px) rotate(-3deg); }
    62% { transform: translateY(0.5px) rotate(2.2deg); }
  }
  @keyframes smiley-tilt {
    0%, 100% { transform: translateY(0) rotate(-6deg); }
    50% { transform: translateY(-0.3px) rotate(-3.2deg); }
  }
  @keyframes smiley-nod {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    30% { transform: translateY(-0.55px) rotate(-2.5deg); }
    65% { transform: translateY(0.35px) rotate(2deg); }
  }
  @keyframes smiley-dots {
    0%, 100% { opacity: 0.15; }
    50% { opacity: 1; }
  }
  @keyframes smiley-talk {
    0%, 100% { transform: scaleY(0.2); }
    18% { transform: scaleY(1); }
    40% { transform: scaleY(0.3); }
    58% { transform: scaleY(0.85); }
    78% { transform: scaleY(0.25); }
  }
  .aiction-smiley-eyes,
  .aiction-smiley-body,
  .aiction-smiley-mouth,
  .aiction-smiley-dot {
    transform-box: fill-box;
    transform-origin: center;
  }
  .aiction-smiley-body {
    animation: smiley-bob 3.4s ease-in-out infinite;
  }
  svg[data-aiction-mood="thinking"] .aiction-smiley-body {
    animation: smiley-tilt 2.6s ease-in-out infinite;
  }
  svg[data-aiction-mood="speaking"] .aiction-smiley-body {
    animation: smiley-nod 0.72s ease-in-out infinite;
  }
  .aiction-smiley-eyes {
    animation: smiley-blink 4.2s ease-in-out infinite;
  }
  svg[data-aiction-mood="speaking"] .aiction-smiley-mouth {
    animation: smiley-talk 0.72s ease-in-out infinite;
  }
  .aiction-smiley-dot-1 { animation: smiley-dots 1.6s ease-in-out infinite; }
  .aiction-smiley-dot-2 { animation: smiley-dots 1.6s ease-in-out 0.4s infinite; }
  .aiction-smiley-dot-3 { animation: smiley-dots 1.6s ease-in-out 0.8s infinite; }
`

export type SmileyMood = "idle" | "thinking" | "speaking"

interface Props {
  size?: number
  /** 覆盖线条色（默认主题品牌色） */
  color?: string
  /** 关闭摇摆/眨眼（小尺寸圆点内只保留静态轮廓） */
  animated?: boolean
  /** 表情：idle = 摇摆眨眼；thinking = 歪头眺望 + 思考点；speaking = 点头 + O 嘴开合 */
  mood?: SmileyMood
}

/** idle 微笑嘴（原版弧线） */
const SMILE_MOUTH = "M8 13.9c1.05 1.5 2.4 2.3 4 2.3s2.95-.8 4-2.3"
/** thinking 抿嘴浅弧（轻微上扬的线条，斟酌感） */
const THINK_MOUTH = "M10.3 15.3q1.7 0.75 3.4 0"
/** thinking 弯眉眼（右眼变成上弯弧，眺望感；中心对齐 15.3） */
const THINK_EYE_R = "M13.7 10.9q1.6 -1.7 3.2 0"
/** speaking 心中细点 */
const THINK_DOTS = [
  { cx: 18.2, cy: 6.4, r: 0.5 },
  { cx: 20.2, cy: 4.4, r: 0.65 },
  { cx: 21.9, cy: 2.5, r: 0.8 }
]

/**
 * 灵动岛 idle 态的笑脸（简笔线条）：描边圆 + 豆眼 + 线条嘴，传达「待命」的活质感。
 * idle 轻微摇摆 + 定期眨眼；thinking 歪头眺望 + 思考点；speaking 点头 + O 嘴开合。
 */
export default function SmileyFace({
  size = 18,
  color,
  animated = true,
  mood = "idle"
}: Props) {
  const theme = useUiTheme()
  const uid = useId()
  const stroke = color ?? theme.brand.primary
  const isThinking = mood === "thinking"
  const isSpeaking = mood === "speaking"
  const cls = (name: string) => (animated ? name : undefined)

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      data-aiction-mood={mood}
      aria-hidden="true"
      /* 动画 transform（bob 摇摆/思考点）可能轻微溢出 viewBox，防止大尺寸下被裁 */
      style={{ overflow: "visible" }}>
      {animated ? <style>{SMILEY_CSS}</style> : null}
      <g key={uid} className={cls("aiction-smiley-body")}>
        <circle cx="12" cy="12" r="9.1" stroke={stroke} strokeWidth="1.7" />
        {/* thinking：右上三粒思考点错拍闪烁 */}
        {isThinking
          ? THINK_DOTS.map((d, i) => (
              <circle
                key={i}
                className={cls(`aiction-smiley-dot aiction-smiley-dot-${i + 1}`)}
                cx={d.cx}
                cy={d.cy}
                r={d.r}
                fill={stroke}
                opacity={animated ? undefined : 0.5}
              />
            ))
          : null}
        <g className={cls("aiction-smiley-eyes")}>
          <circle cx="8.7" cy="10.1" r="1.15" fill={stroke} />
          {/* thinking：右眼换成上弯弧（眺望），其余态保持豆眼 */}
          {isThinking ? (
            <path
              d={THINK_EYE_R}
              stroke={stroke}
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          ) : (
            <circle cx="15.3" cy="10.1" r="1.15" fill={stroke} />
          )}
        </g>
        {/* 嘴：speaking = O 嘴（线描圆）开合；thinking = 抿嘴浅弧；idle = 原版微笑弧 */}
        {isSpeaking ? (
          <circle
            className={cls("aiction-smiley-mouth")}
            cx="12"
            cy="15.1"
            r="1.5"
            stroke={stroke}
            strokeWidth="1.7"
          />
        ) : (
          <path
            className={cls("aiction-smiley-mouth")}
            d={isThinking ? THINK_MOUTH : SMILE_MOUTH}
            stroke={stroke}
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        )}
      </g>
    </svg>
  )
}
