import { useId } from "react"

/**
 * 蜜桃奶油团子动画样式（keyframes 在 shadow root 内全局生效；多处输出同名规则无害，后者覆盖前者内容相同）。
 *
 * 设计语言：日系 kawaii 果冻团子
 *   脸 = 蜜桃奶油径向渐变（#FFE7CF 高光偏上 → #FFC9A3 → #FF9E74 边缘暖化）；
 *   五官 = 暖可可 #5F2B1E；腮红 = 樱粉 #FF8FB4；豆眼带双白高光（高光在眨眼组内同步压扁）。
 * 编排以「果冻感 + 微表情密度」为核心：
 *   1. 整脸 float：弹跳 + squash & stretch 果冻（idle 1.15s / speaking 1.44s 两拍点头 / thinking 2.2s 慢漂）；
 *   2. idle：大周期里只偶尔歪头偷看一眼（86% 时间静止），眼珠快瞟 + 两次快眨（浅+深）+ w 嘴轻哼；
 *   3. thinking：恒歪头 + 眼睛上飘游移 + 眯眼凝视 + 嘴变「嗯~」小 o 圈，头顶冒三颗思考泡泡错拍上浮；
 *   4. speaking：身体随节拍点头，嘴 O 弹性开合（非等幅模拟语音），弯月笑眼 + 眯一下，旁白双音符起伏。
 *
 * 层级：float（弹跳+果冻）> body（歪头/摇摆/点头）> [脸 + 腮红 + look（视线平移） > eye（眨眼 squash）] + mouth。
 * 泡泡/音符挂在 float 层、body 外：跟随弹跳但不受五官 transform 干扰。
 */
const SMILEY_CSS = `
  /* ---- float：果冻弹跳 ---- */
  @keyframes aiction-mochi-float {
    0%, 100% { transform: translateY(0) scale(1, 1); }
    28% { transform: translateY(-1.35px) scale(1.05, 0.95); }
    58% { transform: translateY(0.45px) scale(0.965, 1.035); }
  }
  /* ---- idle：偶尔歪头偷看（多数时间静止，动作稀有才灵动） ---- */
  @keyframes aiction-mochi-tilt {
    0%, 56%, 80%, 100% { transform: rotate(0deg); }
    63% { transform: rotate(-5deg); }
    72% { transform: rotate(4deg); }
  }
  /* ---- idle：眼珠快瞟 ---- */
  @keyframes aiction-mochi-peep {
    0%, 12% { transform: translate(0, 0); }
    22%, 32% { transform: translate(-1.5px, 0.4px); }
    44% { transform: translate(0, 0); }
    56%, 66% { transform: translate(1.5px, -0.35px); }
    78%, 100% { transform: translate(0, 0); }
  }
  /* ---- 两次快眨（第一下浅、第二下深偷笑感） ---- */
  @keyframes aiction-mochi-blink {
    0%, 36%, 40%, 68%, 74%, 100% { transform: scaleY(1); }
    37.5%, 39.5% { transform: scaleY(0.16); }
    70%, 73% { transform: scaleY(0.07); }
  }
  /* ---- idle：w 嘴轻哼开合 ---- */
  @keyframes aiction-mochi-hum {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.12); }
  }
  /* ---- 腮红呼吸 ---- */
  @keyframes aiction-mochi-blush {
    0%, 100% { opacity: 0.1; }
    50% { opacity: 0.5; }
  }

  /* ---- thinking：恒歪头 + 缓摆 ---- */
  @keyframes aiction-mochi-think-tilt {
    0%, 100% { transform: rotate(-5.5deg); }
    50% { transform: rotate(-3deg); }
  }
  /* ---- thinking：眼睛上飘游移（望向上方斟酌） ---- */
  @keyframes aiction-mochi-think-look {
    0%, 100% { transform: translate(0.4px, -1.05px); }
    35% { transform: translate(1.15px, -1.5px); }
    70% { transform: translate(-0.45px, -1.3px); }
  }
  /* ---- thinking：常态眯眼凝视（scaleY 0.55），中段闭眼强调 ---- */
  @keyframes aiction-mochi-think-squint {
    0%, 42%, 80%, 100% { transform: scaleY(0.55); }
    58%, 68% { transform: scaleY(0.12); }
  }
  /* ---- thinking：小 o 嘴呼吸 + 微旋（嗯~在斟酌） ---- */
  @keyframes aiction-mochi-think-o {
    0%, 100% { transform: scale(1) rotate(0deg); }
    48%, 66% { transform: scale(1.35) rotate(-6deg); }
  }
  /* ---- thinking：思考泡泡上浮 pop（小→大→飘走） ---- */
  @keyframes aiction-mochi-bubble {
    0% { transform: translateY(1.6px) scale(0.35); opacity: 0; }
    18% { opacity: 0.95; }
    62% { transform: translateY(-1.7px) scale(1); opacity: 0.95; }
    100% { transform: translateY(-2.9px) scale(1.06); opacity: 0; }
  }

  /* ---- speaking：随节拍点头摇摆 ---- */
  @keyframes aiction-mochi-speak-nod {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    30% { transform: translateY(-0.55px) rotate(-3deg); }
    62% { transform: translateY(0.4px) rotate(2.4deg); }
  }
  /* ---- speaking：O 嘴弹性开合（两拍非等幅，模拟语音起伏） ---- */
  @keyframes aiction-mochi-speak-mouth {
    0%, 100% { transform: scaleY(0.22); }
    16% { transform: scaleY(1); }
    34% { transform: scaleY(0.3); }
    50% { transform: scaleY(0.92); }
    66% { transform: scaleY(0.28); }
  }
  /* ---- speaking：弯月笑眼随点头眯一下 ---- */
  @keyframes aiction-mochi-speak-squint {
    0%, 100% { transform: scaleY(1); }
    46% { transform: scaleY(0.7); }
  }
  /* ---- speaking：旁白音符起伏飘起 ---- */
  @keyframes aiction-mochi-note {
    0% { transform: translateY(1.2px) rotate(-4deg); opacity: 0; }
    20% { opacity: 0.95; }
    70% { transform: translateY(-1.6px) rotate(5deg); opacity: 0.8; }
    100% { transform: translateY(-2.4px) rotate(-3deg); opacity: 0; }
  }

  /* ---- 基类：fill-box 中心为各层 transform 原点 ---- */
  .aiction-mochi-float,
  .aiction-mochi-body,
  .aiction-mochi-look,
  .aiction-mochi-eye,
  .aiction-mochi-mouth,
  .aiction-mochi-bubble,
  .aiction-mochi-note {
    transform-box: fill-box;
    transform-origin: center;
  }

  svg[data-aiction-mood] .aiction-mochi-float {
    animation: aiction-mochi-float 1.15s ease-in-out infinite;
  }
  svg[data-aiction-mood="thinking"] .aiction-mochi-float {
    animation-duration: 2.2s;
  }
  svg[data-aiction-mood="speaking"] .aiction-mochi-float {
    animation-duration: 1.44s;
  }

  svg[data-aiction-mood] .aiction-mochi-blush {
    animation: aiction-mochi-blush 3.6s ease-in-out infinite;
  }

  svg[data-aiction-mood="idle"] .aiction-mochi-body {
    animation: aiction-mochi-tilt 4.6s ease-in-out infinite;
  }
  svg[data-aiction-mood="idle"] .aiction-mochi-look {
    animation: aiction-mochi-peep 3.2s ease-in-out infinite;
  }
  svg[data-aiction-mood="idle"] .aiction-mochi-eye {
    animation: aiction-mochi-blink 3.4s ease-in-out infinite;
  }
  svg[data-aiction-mood="idle"] .aiction-mochi-mouth {
    animation: aiction-mochi-hum 1.6s ease-in-out infinite;
  }

  svg[data-aiction-mood="thinking"] .aiction-mochi-body {
    animation: aiction-mochi-think-tilt 2.4s ease-in-out infinite;
  }
  svg[data-aiction-mood="thinking"] .aiction-mochi-look {
    animation: aiction-mochi-think-look 2.6s ease-in-out infinite;
  }
  svg[data-aiction-mood="thinking"] .aiction-mochi-eye {
    animation: aiction-mochi-think-squint 2.4s ease-in-out infinite;
  }
  svg[data-aiction-mood="thinking"] .aiction-mochi-mouth {
    animation: aiction-mochi-think-o 2.4s ease-in-out infinite;
  }
  .aiction-mochi-bubble-1 { animation: aiction-mochi-bubble 1.65s ease-in-out infinite; }
  .aiction-mochi-bubble-2 { animation: aiction-mochi-bubble 1.65s ease-in-out 0.55s infinite; }
  .aiction-mochi-bubble-3 { animation: aiction-mochi-bubble 1.65s ease-in-out 1.1s infinite; }

  svg[data-aiction-mood="speaking"] .aiction-mochi-body {
    animation: aiction-mochi-speak-nod 0.72s ease-in-out infinite;
  }
  svg[data-aiction-mood="speaking"] .aiction-mochi-eye {
    animation: aiction-mochi-speak-squint 1.44s ease-in-out infinite;
  }
  svg[data-aiction-mood="speaking"] .aiction-mochi-mouth {
    animation: aiction-mochi-speak-mouth 0.72s ease-in-out infinite;
  }
  .aiction-mochi-note-1 { animation: aiction-mochi-note 1.35s ease-in-out infinite; }
  .aiction-mochi-note-2 { animation: aiction-mochi-note 1.35s ease-in-out 0.5s infinite; }
`

/* ---- 蜜桃奶油配色 ---- */
/** 五官暖可可色 */
const FEATURE = "#5F2B1E"
/** 腮红樱粉 */
const BLUSH = "#FF8FB4"
/** 脸渐变（蜜桃奶油：高光偏上，边缘暖化） */
const FACE_GRAD_STOPS = [
  { offset: "0", color: "#FFE7CF" },
  { offset: "0.45", color: "#FFC9A3" },
  { offset: "1", color: "#FF9E74" }
]

/** idle 小猫 w 嘴（两段对称小弧，宽 4.9 居中） */
const W_MOUTH = "M9.55 14.6q1.2 1.5 2.45 0q1.2 1.5 2.45 0"
/** speaking 弯月笑眼（上弯弧，中心分别对齐 7.9 / 16.1） */
const HAPPY_EYE_L = "M6.15 10.6q1.75 -1.6 3.5 0"
const HAPPY_EYE_R = "M14.35 10.6q1.75 -1.6 3.5 0"
/** 豆眼（大椭圆 + 双白高光），[左心 x, 右心 x] */
const EYE_CX = [7.9, 16.1] as const

export type SmileyMood = "idle" | "thinking" | "speaking"

interface Props {
  size?: number
  /** 覆盖五官色（默认暖可可 #5F2B1E）；脸色固定蜜桃奶油，不随主题 */
  color?: string
  /** 关闭全部动画（小尺寸圆点内只保留静态轮廓） */
  animated?: boolean
  /** 表情：idle = 日常灵动团子；thinking = 歪头冒泡泡；speaking = 笑眼唱 O 嘴 */
  mood?: SmileyMood
}

/**
 * 灵动岛 idle 态的笑脸（蜜桃奶油团子风）：大豆眼 + 双高光 + 小猫 w 嘴 + 樱粉腮红。
 * idle 偶尔歪头偷看 + 眼珠快瞟 + 双速眨眼 + 果冻弹跳；thinking 歪头冒泡泡；speaking 笑眼点头唱 O 嘴。
 */
export function MochiSmileyFace({
  size = 20,
  color,
  animated = true,
  mood = "idle"
}: Props) {
  const uid = useId()
  const gradId = `aiction-mochi-face-${uid}`
  const blurId = `aiction-mochi-blur-${uid}`
  const feature = color ?? FEATURE
  const isThinking = mood === "thinking"
  const isSpeaking = mood === "speaking"
  const cls = (name: string) => (animated ? name : undefined)

  return (
    <svg
      width={size}
      height={size}
      viewBox="2.4 2.4 19.2 19.2"
      fill="none"
      data-aiction-mood={mood}
      aria-hidden="true"
      /* viewBox 紧贴静止脸圆，动画 transform（弹跳/泡泡/音符）会溢出 viewBox；
         SVG 根默认 overflow hidden，大尺寸下会被裁成「跳出显示区域」，故放开 */
      style={{ overflow: "visible" }}>
      {animated ? <style>{SMILEY_CSS}</style> : null}
      <defs>
        <radialGradient id={gradId} cx="0.5" cy="0.35" r="0.75">
          {FACE_GRAD_STOPS.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </radialGradient>
        <filter id={blurId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="0.7" />
        </filter>
      </defs>
      <g className={cls("aiction-mochi-float")}>
        {/* thinking：头顶三颗思考泡泡，从小到大错拍上浮 */}
        {isThinking && animated ? (
          <>
            <g className="aiction-mochi-bubble aiction-mochi-bubble-1">
              <circle cx="17.3" cy="6.3" r="0.85" fill={feature} />
            </g>
            <g className="aiction-mochi-bubble aiction-mochi-bubble-2">
              <circle cx="19.2" cy="3.9" r="1.25" fill={feature} />
            </g>
            <g className="aiction-mochi-bubble aiction-mochi-bubble-3">
              <circle cx="21.3" cy="1.5" r="1.7" fill={feature} />
            </g>
          </>
        ) : null}
        {/* speaking：右上两枚音符起伏（♪ = 竖线 + 符头） */}
        {isSpeaking && animated ? (
          <>
            <g className="aiction-mochi-note aiction-mochi-note-1">
              <path d="M20.7 9.2V6" stroke={feature} strokeWidth="1.5" strokeLinecap="round" />
              <ellipse cx="20.15" cy="9.15" rx="0.85" ry="0.58" fill={feature} />
            </g>
            <g className="aiction-mochi-note aiction-mochi-note-2">
              <path d="M18.4 5.5V2.6" stroke={feature} strokeWidth="1.5" strokeLinecap="round" />
              <ellipse cx="17.85" cy="5.45" rx="0.8" ry="0.55" fill={feature} />
            </g>
          </>
        ) : null}
        <g className={cls("aiction-mochi-body")}>
          {/* 蜜桃团子脸 */}
          <circle cx="12" cy="12" r="9.6" fill={`url(#${gradId})`} />
          {/* 樱粉腮红（高斯模糊软边，呼吸闪烁） */}
          <ellipse
            className={cls("aiction-mochi-blush")}
            cx="4.85"
            cy="13.7"
            rx="1.9"
            ry="1.2"
            fill={BLUSH}
            filter={animated ? `url(#${blurId})` : undefined}
            opacity={animated ? undefined : 0.4}
          />
          <ellipse
            className={cls("aiction-mochi-blush")}
            cx="19.15"
            cy="13.7"
            rx="1.9"
            ry="1.2"
            fill={BLUSH}
            filter={animated ? `url(#${blurId})` : undefined}
            opacity={animated ? undefined : 0.4}
          />
          {/* 眼睛：speaking = 弯月笑眼；其余 = 大豆眼 + 双高光（眨眼整组压扁，高光同步） */}
          {isSpeaking ? (
            <g className={cls("aiction-mochi-look")}>
              <path
                className={cls("aiction-mochi-eye")}
                d={HAPPY_EYE_L}
                stroke={feature}
                strokeWidth="1.9"
                strokeLinecap="round"
              />
              <path
                className={cls("aiction-mochi-eye")}
                d={HAPPY_EYE_R}
                stroke={feature}
                strokeWidth="1.9"
                strokeLinecap="round"
              />
            </g>
          ) : (
            <g className={cls("aiction-mochi-look")}>
              {EYE_CX.map((cx) => (
                <g key={cx} className={cls("aiction-mochi-eye")}>
                  <ellipse cx={cx} cy="10.1" rx="1.62" ry="2.15" fill={feature} />
                  <circle cx={cx + 0.5} cy="9.35" r="0.5" fill="#fff" />
                  <circle cx={cx - 0.48} cy="10.85" r="0.26" fill="#fff" opacity={0.85} />
                </g>
              ))}
            </g>
          )}
          {/* 嘴：speaking = O 嘴（口腔+舌头）弹性开合；thinking = 「嗯~」小 o 圈；idle = 小猫 w 嘴 */}
          {isSpeaking ? (
            <g className={cls("aiction-mochi-mouth")}>
              <ellipse cx="12" cy="15.6" rx="2.5" ry="2.05" fill={feature} />
              <ellipse cx="12" cy="16.65" rx="1.45" ry="0.85" fill={BLUSH} />
            </g>
          ) : isThinking ? (
            <ellipse
              className={cls("aiction-mochi-mouth")}
              cx="12"
              cy="15.4"
              rx="1.3"
              ry="1.25"
              stroke={feature}
              strokeWidth="1.9"
              fill="none"
            />
          ) : (
            <path
              className={cls("aiction-mochi-mouth")}
              d={W_MOUTH}
              stroke={feature}
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          )}
        </g>
      </g>
    </svg>
  )
}

export default MochiSmileyFace
