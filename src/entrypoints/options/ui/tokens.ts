/**
 * 设置页专属设计 token（见 docs/OPTIONS_UI.md §4.2）。
 *
 * `src/shared/ui/tokens.ts` 被 popup 与内容脚本共用，规则是「只新增、不改既有值」，
 * 因此设置页的语义 token（控件高度、内容列宽、行距等）集中放在这里。
 * 颜色语义一律取 `uiThemes[themeName]`（蓝色为唯一品牌 / 交互色，禁止再用 theme.brand.*）。
 */

export const optLayout = {
  /** 侧栏固定宽度 */
  sidebarWidth: 280,
  /** 窄窗折叠为图标栏后的宽度（与 optLayout.collapsedBreakpoint 配套） */
  sidebarCollapsedWidth: 68,
  /** 内容列最大宽度（居中） */
  contentMaxWidth: 1360,
  contentPaddingX: 32,
  contentPaddingY: 24,
  topBarPaddingY: 12,
  /** 顶栏固定高度：sticky 保存条的吸附位置与它对齐 */
  topBarHeight: 60,
  /** 行式布局右栏默认宽度 */
  controlWidth: 380,
  /** 开关类窄控件 */
  controlNarrowWidth: 240,
  /** 列表-详情卡的左列表宽度 */
  listWidth: 260,
  /** 行内边距（上下一共 optLayout.rowPaddingY * 2） */
  rowPaddingY: 14,
  /** 说明文案最大宽度 */
  descMaxWidth: "70ch",
  /** 行标题与右侧控件的列间距 */
  rowColumnGap: 24,
  /** 窄窗断点：侧栏折叠 + 控件宽度收敛 */
  collapsedBreakpoint: 1100
} as const

export const optSize = {
  controlHeight: 32,
  controlHeightLg: 36,
  cardRadius: 12,
  controlRadius: 8,
  smallRadius: 6,
  /** 行标题 13 / 行说明 12 / 卡片标题 15 / 分区标题 17 */
  rowTitleSize: 13,
  rowDescSize: 12,
  cardTitleSize: 15,
  sectionTitleSize: 17,
  groupTitleSize: 12
} as const
