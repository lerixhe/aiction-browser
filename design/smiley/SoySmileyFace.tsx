import { useId } from "react"
import { useUiTheme } from "@/shared/ui/theme"

/**
 * 笑脸动画样式（keyframes 在 shadow root 内全局生效；多处输出同名规则无害，后者覆盖前者内容相同）。
 *
 * 设计风格对齐 Telegram 动画表情（😊 U+1F60A Lottie 实测配色）：
 *   脸 = 黄色径向渐变（#FFEC5C → #FFD91D → #F49A0F，高光偏上做立体）；五官 = 深棕 #6B2000；腮红 = #F68CE8。
 * 编排参考 Telegram 与 Google Noto emoji animation 的逆向数据：
 *   1. 快节奏：0.3-0.7s 一个小动作，各元素周期互质错拍，永不静止；
 *   2. 整脸动：脸本体快速摇摆/弹跳，而非只有五官在动；
 *   3. 眨眼极快（50-100ms），浅眨与深眨交替；
 *   4. 眉毛大幅位移、左右不对称（thinking）；
 *   5. 全程 squash & stretch 果冻感；
 *   6. 腮红淡入淡出呼吸（Noto blush o:4kf）；
 *   7. thinking = 平时高频微晃 + 周期中段插入一次大表情（挑眉+闭眼+歪嘴）。
 *
 * 层级：float（弹跳+果冻）> shift（高频平移微晃，thinking 用）> body（摇摆/歪头）
 *       > [face circle] > [brows] > [blush] > gaze（眼珠平移）> eyes；mouth 与 gaze 平级。
 */
const SMILEY_CSS = `
  /* ---- float：整脸弹跳 + 果冻（idle 1.3s / thinking 1.1s） ---- */
  @keyframes aiction-smiley-float {
    0%, 100% { transform: translateY(0) scale(1, 1); }
    30% { transform: translateY(-1.1px) scale(1.045, 0.955); }
    62% { transform: translateY(0.7px) scale(0.97, 1.03); }
  }

  /* ---- shift：高频平移微晃（thinking 专用，Noto Face Ctrl 的灵魂） ---- */
  @keyframes aiction-smiley-shift {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(-0.6px, -0.35px); }
  }

  /* ---- idle：整脸左右摇摆（Noto 😊 Null Face 的快摇） ---- */
  @keyframes aiction-smiley-sway {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-9deg); }
    50% { transform: rotate(0deg); }
    75% { transform: rotate(9deg); }
  }
  /* ---- idle：眼珠快瞟 ---- */
  @keyframes aiction-smiley-glance {
    0%, 12% { transform: translate(0, 0); }
    22%, 32% { transform: translate(-1.8px, 0.55px); }
    44% { transform: translate(0, 0); }
    58%, 68% { transform: translate(1.8px, -0.45px); }
    80%, 100% { transform: translate(0, 0); }
  }
  /* ---- idle：两次快眨（第一下浅、第二下深） ---- */
  @keyframes aiction-smiley-blink {
    0%, 37%, 41%, 71%, 77%, 100% { transform: scaleY(1); }
    38.5%, 39.5% { transform: scaleY(0.2); }
    73%, 75% { transform: scaleY(0.08); }
  }
  /* ---- idle：微笑呼吸 ---- */
  @keyframes aiction-smiley-smile {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1) translateY(-0.35px); }
  }
  /* ---- idle：腮红淡入淡出呼吸（Noto blush 的慢节奏） ---- */
  @keyframes aiction-smiley-blush {
    0%, 100% { opacity: 0.12; }
    50% { opacity: 0.55; }
  }

  /* ---- speaking：O 嘴开合说话（0.56s 两个音节拍，非等幅模拟语音起伏） ---- */
  @keyframes aiction-smiley-speak-mouth {
    0%, 100% { transform: scaleY(0.18); }
    18% { transform: scaleY(1); }
    36% { transform: scaleY(0.28); }
    52% { transform: scaleY(0.85); }
    70% { transform: scaleY(0.22); }
  }
  /* ---- speaking：轻微点头随声摇摆 ---- */
  @keyframes aiction-smiley-speak-nod {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    30% { transform: translateY(-0.5px) rotate(-2.5deg); }
    65% { transform: translateY(0.35px) rotate(2deg); }
  }
  /* ---- speaking：目光专注直视前方微移 ---- */
  @keyframes aiction-smiley-speak-gaze {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(0.45px, 0.15px); }
  }

  /* ---- thinking：恒歪头 + 缓摆 ---- */
  @keyframes aiction-smiley-think-tilt {
    0%, 100% { transform: rotate(-6.5deg); }
    50% { transform: rotate(-3.5deg); }
  }
  /* ---- thinking：眯眼凝视（基线上移 + 左右微游移） ---- */
  @keyframes aiction-smiley-think-gaze {
    0%, 100% { transform: translate(0.45px, -1.2px); }
    35% { transform: translate(1.3px, -1.6px); }
    70% { transform: translate(-0.6px, -1.4px); }
  }
  /* ---- thinking：常态眯成缝（scaleY 0.5），中段闭眼强调（与挑眉同拍） ---- */
  @keyframes aiction-smiley-think-squint {
    0%, 40%, 78%, 100% { transform: scaleY(0.5); }
    58%, 66% { transform: scaleY(0.1); }
  }
  /* ---- thinking：双眉大幅交替挑动（左眉上挑 ~12% 画布、右眉下压，交换拍） ---- */
  @keyframes aiction-smiley-think-brow-l {
    0%, 32%, 82%, 100% { transform: translateY(0); }
    46%, 68% { transform: translateY(-2.4px); }
  }
  @keyframes aiction-smiley-think-brow-r {
    0%, 32%, 82%, 100% { transform: translateY(0); }
    46%, 68% { transform: translateY(0.9px); }
  }
  /* ---- thinking：抿嘴中段被拉扯下移 + 微旋（Noto Mouth 的下移+旋） ---- */
  @keyframes aiction-smiley-think-mouth {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    46%, 68% { transform: translateY(0.8px) rotate(-4deg); }
  }

  /* ---- 基类 ---- */
  .aiction-smiley-float,
  .aiction-smiley-shift,
  .aiction-smiley-body,
  .aiction-smiley-gaze,
  .aiction-smiley-eye,
  .aiction-smiley-brow,
  .aiction-smiley-mouth {
    transform-box: fill-box;
    transform-origin: center;
  }

  svg[data-aiction-mood] .aiction-smiley-float {
    animation: aiction-smiley-float 1.3s ease-in-out infinite;
  }
  svg[data-aiction-mood="thinking"] .aiction-smiley-float {
    animation-duration: 1.1s;
  }
  svg[data-aiction-mood="thinking"] .aiction-smiley-shift {
    animation: aiction-smiley-shift 0.55s ease-in-out infinite;
  }

  svg[data-aiction-mood="idle"] .aiction-smiley-body {
    animation: aiction-smiley-sway 0.95s ease-in-out infinite;
  }
  svg[data-aiction-mood="idle"] .aiction-smiley-gaze {
    animation: aiction-smiley-glance 2.2s ease-in-out infinite;
  }
  svg[data-aiction-mood="idle"] .aiction-smiley-eye {
    animation: aiction-smiley-blink 3.9s ease-in-out infinite;
  }
  svg[data-aiction-mood="idle"] .aiction-smiley-mouth {
    animation: aiction-smiley-smile 1.15s ease-in-out infinite;
  }
  svg[data-aiction-mood="idle"] .aiction-smiley-blush,
  svg[data-aiction-mood="speaking"] .aiction-smiley-blush {
    animation: aiction-smiley-blush 3.8s ease-in-out infinite;
  }

  svg[data-aiction-mood="speaking"] .aiction-smiley-body {
    animation: aiction-smiley-speak-nod 0.72s ease-in-out infinite;
  }
  svg[data-aiction-mood="speaking"] .aiction-smiley-gaze {
    animation: aiction-smiley-speak-gaze 1.9s ease-in-out infinite;
  }
  svg[data-aiction-mood="speaking"] .aiction-smiley-eye {
    animation: aiction-smiley-blink 3.9s ease-in-out infinite;
  }
  svg[data-aiction-mood="speaking"] .aiction-smiley-mouth {
    animation: aiction-smiley-speak-mouth 0.56s ease-in-out infinite;
  }

  svg[data-aiction-mood="thinking"] .aiction-smiley-body {
    animation: aiction-smiley-think-tilt 2.6s ease-in-out infinite;
  }
  svg[data-aiction-mood="thinking"] .aiction-smiley-gaze {
    animation: aiction-smiley-think-gaze 1.9s ease-in-out infinite;
  }
  svg[data-aiction-mood="thinking"] .aiction-smiley-eye {
    animation: aiction-smiley-think-squint 2.6s ease-in-out infinite;
  }
  svg[data-aiction-mood="thinking"] .aiction-smiley-brow-l {
    animation: aiction-smiley-think-brow-l 2.6s ease-in-out infinite;
  }
  svg[data-aiction-mood="thinking"] .aiction-smiley-brow-r {
    animation: aiction-smiley-think-brow-r 2.6s ease-in-out infinite;
  }
  svg[data-aiction-mood="thinking"] .aiction-smiley-mouth {
    animation: aiction-smiley-think-mouth 2.6s ease-in-out infinite;
  }
`

/* ---- Telegram 😊 Lottie 实测配色 ---- */
/** 五官深棕（TG Eyes/Brows/Mouth #6B2000） */
const FEATURE = "#6B2000"
/** 腮红粉（TG Blush #F68CE8） */
const BLUSH = "#F68CE8"
/** 脸渐变（TG #FFEE1D 主黄 + #F6930E/#FFB41D 暗部，高光偏上） */
const FACE_GRAD_STOPS = [
  { offset: "0", color: "#FFEC5C" },
  { offset: "0.5", color: "#FFD91D" },
  { offset: "1", color: "#F49A0F" }
]

/** idle 微笑嘴（短弧、浅弯，TG 黄豆比例：宽约 42% 脸宽） */
const SMILE_MOUTH = "M8 13.9c.9 2 2.2 3 4 3s3.1-1 4-3"
/** thinking 歪抿嘴（窄短、斜向上挑，斟酌感；中段动画会下移+微旋） */
const THINK_MOUTH = "M9.4 16.8c1.8-.85 3.9-.9 5.6-.15"
/** thinking 左眉：低位平拱（皱眉起始态，中段大幅上挑） */
const THINK_BROW_L = "M5.2 5.9c1.6-.7 3.4-.7 4.9.3"
/** thinking 右眉：高位平拱（hmm 挑眉起始态，中段下压交换） */
const THINK_BROW_R = "M13.9 4.6c1.6-.8 3.5-.8 5.1 0"

/** speaking O 嘴（口腔 + 舌头；由 mouth 组 scaleY 开合） */
const SPEAK_MOUTH_CAVITY = { cx: 12, cy: 15.8, rx: 2.3, ry: 1.75 }
const SPEAK_MOUTH_TONGUE = { cx: 12, cy: 16.4, rx: 1.3, ry: 0.65 }

export type SmileyMood = "idle" | "thinking" | "speaking"

interface Props {
  size?: number
  /** 覆盖五官色（默认 Telegram 深棕 #6B2000）；脸色固定 Telegram 黄，不随主题 */
  color?: string
  /** 关闭全部动画（小尺寸圆点内只保留静态轮廓） */
  animated?: boolean
  /** 表情：idle = 日常灵动笑脸；thinking = 思考状；speaking = 说话中（O 嘴开合） */
  mood?: SmileyMood
}

/**
 * 灵动岛 idle 态的笑脸（Telegram 黄豆风）：黄色渐变圆脸 + 深棕五官 + 腮红。
 * idle 整脸快摇 + 眼珠快瞟 + 双速眨眼 + 果冻弹跳 + 腮红呼吸；thinking 高频微晃 + 歪头眯眼 + 双眉大幅交替。
 */
export function SoySmileyFace({
  size = 20,
  color,
  animated = true,
  mood = "idle"
}: Props) {
  const uid = useId()
  const gradId = `aiction-smiley-face-${uid}`
  const blurId = `aiction-smiley-blur-${uid}`
  const feature = color ?? FEATURE
  const isThinking = mood === "thinking"
  const isSpeaking = mood === "speaking"

  return (
    <svg
      width={size}
      height={size}
      viewBox="2.4 2.4 19.2 19.2"
      fill="none"
      data-aiction-mood={mood}
      aria-hidden="true"
      /* viewBox 紧贴静止脸圆，动画 transform（弹跳/squash）会溢出 viewBox；
         SVG 根默认 overflow hidden，大尺寸下会被裁成「跳出显示区域」，故放开 */
      style={{ overflow: "visible" }}>
      {animated ? <style>{SMILEY_CSS}</style> : null}
      <defs>
        <radialGradient id={gradId} cx="0.5" cy="0.38" r="0.72">
          {FACE_GRAD_STOPS.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </radialGradient>
        <filter id={blurId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="0.55" />
        </filter>
      </defs>
      <g className={animated ? "aiction-smiley-float" : undefined}>
        <g className={animated ? "aiction-smiley-shift" : undefined}>
          <g className={animated ? "aiction-smiley-body" : undefined}>
            {/* 黄豆脸 */}
            <circle cx="12" cy="12" r="9.6" fill={`url(#${gradId})`} />
            {isThinking ? (
              <>
                <path
                  className={animated ? "aiction-smiley-brow aiction-smiley-brow-l" : undefined}
                  d={THINK_BROW_L}
                  stroke={feature}
                  strokeWidth="1.9"
                  strokeLinecap="round"
                />
                <path
                  className={animated ? "aiction-smiley-brow aiction-smiley-brow-r" : undefined}
                  d={THINK_BROW_R}
                  stroke={feature}
                  strokeWidth="1.9"
                  strokeLinecap="round"
                />
              </>
            ) : (
              <>
                <ellipse
                  className={animated ? "aiction-smiley-blush" : undefined}
                  cx="5.1"
                  cy="13.3"
                  rx="1.7"
                  ry="1.05"
                  fill={BLUSH}
                  filter={animated ? `url(#${blurId})` : undefined}
                  opacity={animated ? undefined : 0.35}
                />
                <ellipse
                  className={animated ? "aiction-smiley-blush" : undefined}
                  cx="18.9"
                  cy="13.3"
                  rx="1.7"
                  ry="1.05"
                  fill={BLUSH}
                  filter={animated ? `url(#${blurId})` : undefined}
                  opacity={animated ? undefined : 0.35}
                />
              </>
            )}
            <g className={animated ? "aiction-smiley-gaze" : undefined}>
              <ellipse
                className={animated ? "aiction-smiley-eye" : undefined}
                cx="7.2"
                cy="9.6"
                rx="1.55"
                ry="2.1"
                fill={feature}
              />
              <ellipse
                className={animated ? "aiction-smiley-eye" : undefined}
                cx="16.8"
                cy="9.6"
                rx="1.55"
                ry="2.1"
                fill={feature}
              />
            </g>
            {isSpeaking ? (
              <g className={animated ? "aiction-smiley-mouth" : undefined}>
                <ellipse
                  cx={SPEAK_MOUTH_CAVITY.cx}
                  cy={SPEAK_MOUTH_CAVITY.cy}
                  rx={SPEAK_MOUTH_CAVITY.rx}
                  ry={SPEAK_MOUTH_CAVITY.ry}
                  fill={feature}
                />
                <ellipse
                  cx={SPEAK_MOUTH_TONGUE.cx}
                  cy={SPEAK_MOUTH_TONGUE.cy}
                  rx={SPEAK_MOUTH_TONGUE.rx}
                  ry={SPEAK_MOUTH_TONGUE.ry}
                  fill={BLUSH}
                />
              </g>
            ) : (
              <path
                className={animated ? "aiction-smiley-mouth" : undefined}
                d={isThinking ? THINK_MOUTH : SMILE_MOUTH}
                stroke={feature}
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </g>
        </g>
      </g>
    </svg>
  )
}

export default SoySmileyFace
