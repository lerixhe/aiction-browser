/**
 * 灵动岛各形态的固定尺寸（morph 动画需要显式数值）。
 * 形态固定：聊天岛只在 pill ⇄ expanded 间切换，朗读岛只在 circle ⇄ expanded 间切换，
 * 没有主副互换——双岛时恒为「聊天胶囊（左） + 朗读圆球（右）」。
 */
export const ISLAND_METRICS = {
  /** 朗读圆球直径（与聊天胶囊同高：morph 时高度恒定，只变宽度） */
  circle: { size: 32 },
  /** 聊天 idle 胶囊（笑脸 +「询问」） */
  chatIdlePill: { width: 92, height: 32 },
  /** 聊天任务胶囊 */
  chatPill: { width: 148, height: 32 },
  /** 聊天展开面板 */
  chatPanel: { width: 340, height: 560 },
  /** TTS 胶囊（历史尺寸；朗读岛现恒为圆球，pillWidth 仍传值以满足容器 props） */
  ttsPill: { width: 104, height: 32 },
  /** TTS 展开控制条 */
  ttsBar: { width: 448, height: 44 },
  /** 朗读完毕（finished）后闲置退场的等待时长（圆环倒计时与退场计时器共用） */
  ttsDismissMs: 5000,
  /**
   * 双岛间距目标值：聊天胶囊右缘与朗读圆球左缘的距离（恒定，不随胶囊宽度变化）。
   * 原先 anchor 写死 92，idle 胶囊（92 宽）时间距高达 60px、active（148 宽）才 4px；
   * 现改为 anchor 随胶囊宽度推导（见 dualAnchorFor），两态间距一致。
   */
  dualGap: 16,
  /**
   * 兼容默认锚点（未显式计算时的回退值，几何上对应 gap≈4 的最贴状态）。
   * 正确用法：调 dualAnchorFor(chatPillWidth) 得到随胶囊宽度变化的锚点，
   * 两岛必须传同一个值（gap = 2*anchor - 胶囊宽 - 圆球直径 才成立）。
   */
  dualAnchor: 92,
  /** 展开面板圆角 */
  expandedRadius: 20
} as const

/**
 * 按聊天胶囊宽度推算双岛外缘锚点，使间距恒为 dualGap。
 * gap = 2*anchor - chatPillWidth - circleSize = dualGap
 * ⇒ anchor = (chatPillWidth + circleSize + dualGap) / 2
 *
 * 两岛必须传同一个 anchor（聊天岛锚左缘、朗读岛锚右缘）；
 * 胶囊 idle⇄active 变宽时锚点同步外移，wrapper 已有 left 过渡，平滑生效。
 */
export function dualAnchorFor(chatPillWidth: number): number {
  return Math.round((chatPillWidth + ISLAND_METRICS.circle.size + ISLAND_METRICS.dualGap) / 2)
}
