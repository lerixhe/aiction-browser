/** 灵动岛各形态的固定尺寸（morph 动画需要显式数值） */
export const ISLAND_METRICS = {
  /** 聊天任务胶囊 */
  chatPill: { width: 148, height: 32 },
  /** TTS + 聊天双任务同岛时的胶囊宽度 */
  dualPillWidth: 232,
  /** 聊天展开面板 */
  chatPanel: { width: 340, height: 560 },
  /** TTS 任务胶囊 */
  ttsPill: { width: 104, height: 30 },
  /** TTS 展开控制条 */
  ttsBar: { width: 448, height: 44 }
} as const
