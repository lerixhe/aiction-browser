/** 灵动岛各形态的固定尺寸（morph 动画需要显式数值） */
export const ISLAND_METRICS = {
  /** 副岛正圆直径（与主岛胶囊同高：morph 时高度恒定，只变宽度） */
  circle: { size: 32 },
  /** 聊天 idle 胶囊（笑脸 +「询问」） */
  chatIdlePill: { width: 92, height: 32 },
  /** 聊天任务胶囊 */
  chatPill: { width: 148, height: 32 },
  /** 聊天展开面板 */
  chatPanel: { width: 340, height: 560 },
  /** TTS 任务胶囊（高度与聊天胶囊/圆点统一） */
  ttsPill: { width: 104, height: 32 },
  /** TTS 展开控制条 */
  ttsBar: { width: 448, height: 44 },
  /**
   * 双岛外缘锚点到页面中线的距离：朗读岛锁定左缘（50% - anchor）、
   * 聊天岛锁定右缘（50% + anchor）。主副切换时两岛外缘纹丝不动，
   * 只有内缘（近端）伸缩。
   * 间距由最宽组合（主岛胶囊 148 + 副岛圆点 32）决定：gap = 2*anchor - 180，
   * 取 anchor=92 时最贴状态仅 4px；双岛时主岛胶囊与副岛圆点互斥，
   * 胶囊+胶囊组合不存在，锚点不会被其他形态组合击穿。
   */
  dualAnchor: 92,
  /** 展开面板圆角 */
  expandedRadius: 20
} as const
