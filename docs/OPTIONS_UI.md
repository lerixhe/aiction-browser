# 设置页（Options）UI 设计规范

> **本文档是长期维护文档，不是一次性梳理。**
> 改动 `src/entrypoints/options/` 下任何 UI 之前先读本文；新增设置项、新增卡片必须遵守本文的判定标准与检查清单。

| 项目 | 值 |
|------|-----|
| 最后更新 | 2026-10-19（对照 `package.json` version `0.3.0`） |
| 适用范围 | `src/entrypoints/options/`（设置页）；`popup` 与内容脚本**不适用**（见 §8） |
| 设计状态 | **已实现**（原型见 `docs/images/options-ui/`；实施偏差见 §9） |
| 相关代码 | `OptionsPage.tsx`、`ui/`（组件层）、`hooks/draft.ts`（草稿钩子）、`AppearanceSection.tsx`、`QuickActionsCard.tsx`、`CustomActionsCard.tsx`、`SystemPromptSection.tsx`、`BackupSection.tsx`、`AboutSection.tsx`、`Provider{List,Editor,SelectModal}.tsx`、`ModelPicker.tsx`、`ModelParamsEditor.tsx`、`ConfirmDialog.tsx`、`useProviderManager.ts`、`src/shared/ui/{tokens,styles,theme}.ts` |

---

## 1. 背景：这一版要解决的问题

现状（`docs/images/options-ui/before-connection.jpg`）的问题分四类：

| 类别 | 具体问题 |
|------|----------|
| 版面 | 内容列 `maxWidth: 1400` 铺满，控件被拉到 1000+px；卡片靠 `minHeight: 420` 撑出死白；长文案（关于页）单行 100+ 字符 |
| 层级 | 侧栏高亮 + 顶栏 h1 + 卡片 h2 三处重复标题；卡片套卡片但层次不清（关于页同一标题出现两次） |
| 一致性 | 蓝色（`accent`）与青绿（`brand`）双主色并存；圆角 4/6/8 混用；按钮/分段控件/输入框各自手写；`uiSpace[16]` 出现 44 次；中文界面残留 `AI Actions`、`Max Tokens`、未本地化的 copyright |
| 交互 | 即时保存与显式保存两套心智并存且无反馈；删除动作无二次确认；`outline:none` 14 处导致键盘焦点不可见；无 toast / 无 loading 态 |

架构层面的根因：**全部样式是 inline style**（无 CSS 文件），因此 `:hover` / `:focus-visible` / `::placeholder` / 滚动条 / 媒体查询都无法使用，hover 靠 `onMouseEnter` 手写状态模拟。这一条决定了第 2 阶段必须先铺 CSS 地基。

---

## 2. 设计决策

### 2.1 色彩：蓝色是唯一品牌 / 交互色

- 主色 = `uiThemes[].accent.primary`（light `#3B82F6` / dark `#60A5FA`）。
- **青绿（`uiThemes[].brand`）在设置页一律不使用**：它是早期设计的残留（当前全项目仅朗读控件少量引用）。设置页内不得再出现 `theme.brand.*`。
- 语义色只用于语义：`state.error` 仅用于危险操作与错误，`state.warning` 仅用于"模板缺少占位符"这类可修复问题。

### 2.2 版面：全宽行式

- 侧栏 280px 固定（`<1100px` 折叠为图标栏，后续阶段实现）。
- 内容列 `max-width: 1360px` 居中。
- **每条设置是一行**：左侧 = 标题（13px/500）+ 说明（12px/`text.secondary`，`max-width: 70ch`）；右侧 = 控件。
- 右栏控件默认宽度 **380px**（`.row-ctl`）；开关类窄控件 240px 以内。
- **宽控件跨列**：`textarea`、占位符 chips、滑条、长文本说明必须占满剩余宽度，不能塞进 380 栏（否则会折行成三行——原型第一版就是这个错）。
- 行间距：`padding: 14px 0` + 行间 `1px border.hairline`；分组之间用 `.group > h3`（12px/600/uppercase/`letter-spacing: .04em`）分隔，不再依赖卡片留白。
- 顶栏 = 分区标题 + 一句描述（12→13px）。**卡片内不再重复顶栏标题**（服务端动作、提供商等卡片标题用"卡片级"命名，如「快捷动作」/「自定义动作」）。
- **卡片描述只写「这张卡里有什么」**，不写保存机制：「即时生效」「无需保存」「需保存」「按钮类操作，即时执行」都是实现层术语（读起来像在替「为什么不给保存按钮」道歉），混在功能描述里还会被 `·` 切成两段。纯即时卡（外观、快捷动作、备份）描述里不带任何机制说明——有没有保存条本身就是信号；混合卡（API 提供商、自定义动作）用**用户动作视角**保留一句指引：「右侧填写接口与参数，改完点「保存」」（按钮名与保存条一致），不用「需保存」。危险区同理：写「删除后无法恢复」，不写「立即生效」（二次确认已经承担了提示）。

### 2.3 保存模型：即时 vs 草稿（核心判定标准）

> **判定标准：这个操作会不会直接改写"已保存的设置"？**
> 会 → 即时保存；它改的是编辑区里的文本或数值 → 草稿 + 保存条。
> 判据是**操作的影响对象**，不是控件长相（按钮也可能是草稿操作，见下）。

| 归类 | 判定 | 例子 |
|------|------|------|
| 即时 | 开关、分段选择、下拉选择、拖拽排序、新增/删除条目、导入导出 | 主题、界面语言、启用提供商、遥测开关、动作排序、新增/删除动作、导出 JSON |
| 草稿 | 任何进入编辑区产生文本或数值的输入；以及**改草稿的辅助按钮** | 名称、API Key、Model、接口地址、模型参数、动作名称/模板、系统提示词正文、占位符 chips |

两条容易踩错的细则：

1. **下拉框（`select`）归草稿**。它与数值输入同属"配置值"，若按控件类型切开（select 即时、number 草稿），模型参数区会一半即时一半要保存，用户无法理解。判定依据是本行的语义（它在"配置表单"里），不是它长得像按钮。
2. **按钮不一定是即时操作**。系统提示词的占位符 chips 是按钮，但它只改草稿 → 属于草稿操作。

### 2.4 保存条

- 形态：`SaveBar` —— 左「● 有未保存的修改」/「✓ 已保存」（`aria-live="polite"`），右「放弃 / 保存」（无改动时两个按钮静默禁用）。
- **位置按卡片骨架分两种**：
  - 单列表单卡（系统提示词）：**通栏**，吸在顶栏下方（`position: sticky; top: 顶栏高度`）。
  - 列表-详情卡（API 提供商、自定义动作）：**放在详情区顶部**，左列表**不加**保存条（左侧的开关/排序是即时的，通栏保存条会误导用户以为开关也要保存）。
- 没有草稿字段的卡片**不放保存条**：外观、快捷动作、备份与迁移、关于。
- 保存成功后保存条原地变「✓ 已保存」并在约 2s 后回到未修改态；**不用 toast**（位置就近、不飘）。
- 草稿**按条目 id 保留**：改了 provider A 未保存就切到 B，A 的草稿留在内存、左列表对应项显示未保存点（`●` `state.warning`）；切分区同样保留；整页关闭（组件卸载）才丢弃。
- `⌘S / Ctrl+S` 是当前分区的保存快捷键（保留系统提示词现有行为，其他分区一致）。

### 2.5 导航：分区切换 + 滚动归零 + hash 深链

- **保持分区切换**（左栏点击 = 换页，非单页锚点滚动）：同一时刻只挂载一个分区。
  理由：设置页的分区之间几乎不需要对照阅读，单页方案会付出全量挂载（provider 列表 / 模型选择器 / 动作列表）与多层 sticky 打架的代价，收益不可见。
- **切分区时内容容器 `scrollTop = 0`**（现状会保留旧滚动位置，从长分区切到短分区会停在怪异位置）。
- **hash 深链**：`options.html#connection`（取值 = section key）。
  - 优先级：**hash > `chrome.storage.local.optionsActiveSection`（上次分区）> 默认 `appearance`**；
  - 无 hash 进入时把当前分区 `history.replaceState` 写回 URL，保证地址栏可复制分享；
  - 点击左栏用 `replaceState`（**不堆历史**，浏览器后退 = 离开设置页）；
  - 非法 hash 回落到上次分区。

### 2.6 危险操作

- 统一放进详情区底部「危险区」（`DangerZone`：`state.error` 25% 描边 + 3% 底色 + 右侧 danger 按钮 + 一句后果说明）。
- **一律二次确认**（复用 `ConfirmDialog`）：删除提供商（现状已有）、删除动作（现状直接删，要补）。

### 2.7 焦点与反馈

- 所有可交互控件必须有 `:focus-visible` 焦点环（`createFocusRing` 同款：3px 主色 20%），**取代现在 14 处 `outline: none` 且无替代**的写法。
- 鼠标点击不显示焦点环（`:focus-visible` 天然满足）。
- `ConfirmDialog` 补 focus trap + 打开时初始焦点落到取消按钮。
- 设置读取期间显示骨架屏，不再 `if (!themeReady) return null` 白屏。

---

## 3. 分区规格

原型：`docs/images/options-ui/after-part1.jpg`（外观 / 系统提示词 / 备份 / 关于）、`after-part2.jpg`（API 提供商 / AI 动作）。

| 分区 | 卡片 | 保存条 | 即时项 | 草稿字段 |
|------|------|--------|--------|----------|
| 外观 | 外观 | ✗ | 主题、界面语言 | — |
| API 提供商 | API 提供商（左列表 + 右详情） | ✓ 详情区顶部 | 启用开关、添加提供商、删除提供商 | 显示名称、API Key、Model、接口地址、模型参数（含下拉） |
| AI 动作 | 快捷动作 | ✗ | 复制、朗读、语音引擎、语音、朗读语速、自动匹配语言 | — |
| AI 动作 | 自定义动作（左列表 + 右详情） | ✓ 详情区顶部 | 启用开关、拖拽排序、新增动作、删除动作 | 动作名称、图标、动作模板 |
| 系统提示词 | 系统提示词 | ✓ 通栏 | — | 提示词正文 |
| 备份与迁移 | 备份与迁移 | ✗ | 导出 JSON、导入 JSON | — |
| 关于 | 关于 | ✗ | 遥测开关 | — |

详情区内部一律用「基础 / 模型 / 参数 / 危险区」这样的分组标题组织，组内用行式布局。

---

## 4. 组件与 token 规划

### 4.1 新增 options 专属组件层 `src/entrypoints/options/ui/`

实际文件：`tokens.ts`（尺度常量）、`css.ts`（页面级 CSS）、`primitives.tsx`（Button / 控件 / 结构件）、
`shell.tsx`（SettingRow / SectionCard / SaveBar / PageShell）、`index.ts`（统一出口）。

| 组件 | 职责 |
|------|------|
| `PageShell` | 侧栏 + 顶栏 + 内容列（含 max-width、滚动容器 ref） |
| `SectionCard` | 卡片外壳：`head`（标题 + 描述 + 右侧操作）/ 可选 `SaveBar` / `body` |
| `SettingRow` | 行式布局单元：`title` / `desc` / `control` / `width?: "fixed" \| "narrow" \| "wide"` |
| `SaveBar` | 保存条（`dirty` / `onSave` / `onDiscard` / `aria-live`） |
| `Button` | `variant: primary \| secondary \| ghost \| danger` × `size: sm \| md` |
| `SegmentedControl` | 替换外观页两处逐字复制的实现 |
| `TextField` / `NumberField` / `SelectField` / `TextArea` | 统一控件外观（可见描边 + 白底 + focus ring），修复"浅色下看不出输入框边界" |
| `FieldGroup` / `DangerZone` / `EmptyState` / `Skeleton` / `Chip` | 结构件 |

复用既有 `src/shared/ui/toggle-switch.tsx`（开关尺寸/动效已与内容脚本一致）。

### 4.2 token 扩展规则

- `src/shared/ui/tokens.ts` 与 `styles.ts` **被 popup 与内容脚本共用**（`createCardStyle` / `createInputStyle` / `createFocusRing` 等）：**只新增，不改既有值**，否则会连带改变悬浮面板与 popup 的观感。
- 设置页专属语义 token 放 `options/ui/tokens.ts`：控件高度（32/36）、行高、`surface.hover` / `surface.selected`、`focus.ring` 等。
- 尺度统一：圆角卡片 12 / 控件 8 / 小件 6；间距只用 4/8/12/16/24；正文 13/15 两档。

### 4.3 页面级 CSS

在 options 入口注入一段 `<style>`（照 `ChatPanel.tsx` 的做法），类名前缀 `opt-`，承担 inline style 做不到的事：

- `:hover` / `:focus-visible` / `::placeholder` / `::selection`；
- 滚动条配色（深浅两套 token）；
- `@media (max-width: 1100px)` 的侧栏折叠与控件宽度收敛；
- 过渡与 `@keyframes`。

样式优先级：组件层返回 className，**不再在业务代码里手写几十行 inline style**。

---

## 5. 实现细则

1. **草稿钩子**：`useDraftState(initial)` / `useDraftItemMap<T extends {id}>()`，统一处理 dirty 判定、按 id 保留、`⌘S`、保存/放弃、卸载丢弃。禁止各 section 各写一套。
2. **草稿以运行时数据为源**：`settings` 仍是唯一真源，草稿只在上层浅拷贝；保存 = `saveSettings(合并后)`。
3. **`normalizeSettings()` 合并策略不变**（见 `AGENTS.md`）：新增配置项必须同时更新 types / defaults / storage 校验 / 合并逻辑 / i18n。
4. **与 `shared/ui` 的边界**：设置页可以 import `shared/ui` 的 token 与 `ToggleSwitch`；反向不允许（shared 不得依赖 options）。
5. **i18n**：所有新增文案进 `src/shared/i18n/locales/{en,zh_CN}.ts`；本版顺手清理英文残留（`Max Tokens` → 「最大输出 Tokens」、`AI Actions` → 「AI 动作」、copyright 走 i18n）。
6. **埋点**：本版 UI 重构**不新增事件**。以下现有事件的时机/属性必须保持不变：
   - `options_opened`（`entry` 属性来自 `OPTIONS_ENTRY_STORAGE_KEY`）——若将来要把「进入哪个分区」也纳入统计，属新增属性，**必须先更新 `docs/ANALYTICS.md`**（§2 事件清单 + §7 变更记录）；
   - `system_prompt_save` / `action_created` / `action_updated`（含 2s 聚合 flush）/ `action_reordered` / `action_enabled_toggled` / `theme_changed` / `language_changed` / `telemetry_toggled`。
   - 注意：`ActionsSection` 目前依赖**卸载时** flush 未上报的编辑聚合；分区切换仍是卸载语义，改动时要保留这条。
7. **危险与删除**：删除动作补 `ConfirmDialog`；删除 provider 的确认文案保持现有 i18n key。
8. **响应式**：`<1100px` 侧栏折叠为图标栏；内容列 `min-width` 不再写死 400（现在窄窗会挤压双栏）。

---

## 6. 分阶段实施计划

每个阶段独立可验证、可回滚；每阶段结束跑 `npm run typecheck` + `npm run build`。

| 阶段 | 内容 | 验收 | 状态 |
|------|------|------|------|
| 1 | 铺地基：`options/ui/` 组件层 + options token + 页面级 CSS 注入 + `PageShell` 接入（**不改分区逻辑**） | 设置页外观不变但 hover/focus 生效；typecheck + build 通过 | ✅ |
| 2 | 无保存条的 4 张卡改造：外观、快捷动作、备份与迁移、关于 | 行为与埋点事件不变；行式 + 焦点环 + i18n 清理 | ✅ |
| 3 | 有保存条的 3 张卡：系统提示词（通栏条）、API 提供商、自定义动作（详情区条 + 草稿按 id 保留 + 未保存点） | 草稿/保存/放弃/⌘S 行为符合 §2.3–2.4；删除动作二次确认 | ✅ |
| 4 | 收尾：导航（滚动归零 + hash 深链）、侧栏折叠、骨架屏、深色微调、无障碍（`aria-live`、focus trap） | 深链可直接打开指定分区；键盘可完整操作 | ✅ |

> 埋点前置条件：`docs/ANALYTICS.md` §2.4 / §2.5 的事件与属性在本次重构中**零增删**，
> 只更新了触发位置引用（`ActionsSection.tsx` → `CustomActionsCard.tsx`）。

---

## 7. 新增设置项检查清单

1. 判断归属：**即时**还是**草稿**？→ 看它改的是不是"已保存状态"（§2.3），不要看控件长相。
2. 草稿字段 → 必须落在有 `SaveBar` 的卡片里；即时项 → 不得出现在保存条覆盖的编辑区内。
3. 用 `SettingRow` 描述"标题 + 说明"，说明限制 70ch。
4. 宽控件（textarea / chips / 滑条）用 `width="wide"` 跨列。
5. 更新 types / defaults / `normalizeSettings()` 合并 / i18n（中英同步）。
6. 涉及埋点 → 同步 `docs/ANALYTICS.md`。
7. 危险操作 → 进 `DangerZone` + `ConfirmDialog`。

---

## 8. 已知取舍与不做的事

- **不做整站单页 + 左栏锚点定位**（理由见 §2.5）。若将来要做，需先处理：多处固定 DOM id 冲突（`provider-name` / `provider-api-key` / `provider-model` / `model-param-*`）、多层 sticky 打架、跨卡片草稿作用域。
- **不做 toast**：保存反馈走保存条原地变化，避免新增一套全局反馈通道。
- **不做主题色自定义**：主色固定为蓝色，避免用户可调色带来的对比度不可控。
- 内容脚本 / popup 的 UI 不在本规范内，后续如统一，另开文档。
- **浮层（popover）一律钳进视口**：设置页浮层用 `position: fixed` + JS 落位（如动作图标选择器 `computeIconPickerPos`），必须**水平 + 垂直双向**钳制并支持上下翻转。锚点（详情区右侧的图标按钮）可能贴着视口右缘或底缘，只钳垂直会让浮层整块落在安全区外——图标看得见一半、点不到。落位还要跟滚动（含卡片内部滚动容器，`scroll` 用 capture）/ resize 重算，锚点滚出视口即收起。

---

## 9. 变更记录

| 日期 | 变更 | 说明 |
|------|------|------|
| 2026-10-19 | 初版 | 记录设置页 UI 重构的定稿决策：蓝色唯一主色、全宽行式、即时/草稿判定标准、卡片级保存条、分区切换 + 滚动归零 + hash 深链、四阶段实施计划 |
| 2026-10-19 | 实施完成（四阶段一次性落地） | 新增 `options/ui/` 组件层 + `options/hooks/draft.ts`；7 张卡全部改为行式；`OptionsPage` 接入 `PageShell`（hash 深链 / 滚动归零 / 骨架屏）；`ConfirmDialog` 补 focus trap + 初始焦点；i18n 清理并补齐约 45 个新 key（中英同步）；埋点零增删 |
| 2026-10-19 | 卡片描述去术语化 | 卡片描述不再出现「即时生效 / 无需保存 / 需保存 / 即时执行」（见 §2.2）：外观、快捷动作、备份只写卡片内容；提供商与自定义动作改为用户动作视角的「左侧…；右侧…，改完点「保存」」；危险区删除说明去掉「立即生效」；系统提示词的占位符提示与恢复默认确认去掉「草稿」一词 |
| 2026-10-19 | 修复图标选择器溢出安全区 | 动作图标选择器只钳了垂直位置（且是硬编码 280），水平方向完全未处理：详情区靠右时 320px 弹层整块溢出视口右侧无法点击。改为双向视口钳制 + 上下翻转（`computeIconPickerPos`），渲染后按实测尺寸修正，滚动 / resize 跟随锚点、锚点滚出视口即收起；CSS 补 `max-width: calc(100vw - 16px)` 与 `max-height: min(272px, calc(100vh - 16px))`。顺带修 mousedown 点外关闭抢先把 toggle 关掉导致触发按钮点不开也关不掉的冲突（§8 浮层约定） |

### 实施偏差（实现时与设计稿的差异，均为有意取舍）

1. **组件文件划分**：设计稿按组件列清单，实现按职责合成为 `ui/primitives.tsx` 与 `ui/shell.tsx`（导出名不变）。
2. **系统提示词的「恢复默认模板」**放在卡片头部右侧（ghost 按钮），不占行位、不与保存条抢注意力。
3. **关于页合并为一张卡**：原文的「关于我们 / 版本信息 / 遥测」三卡合成一卡四行（版本 / 社区与联系 / 功能一览 / 遥测开关），
   「为什么选择 AIction」的五条改为 `功能一览` 宽行的项目符号列表。
4. **提供商详情区的「接口地址」对 models.dev 提供商同样可编辑**（说明文案区分「留空则用 models.dev 默认地址」），
   与「配置表单里的字段都是草稿」保持一致。
5. **动作的即时开关与草稿的一致性**：左列表的启用开关是即时项，切换时同时改写草稿中同名字段，
   否则「先改文案、再切开关、最后保存草稿」会把开关状态回退成旧值。
6. **`action_updated` 的取值来源**：编辑不再逐字落盘，flush 时改读「草稿优先」的有效值（时机与属性不变，
   见 `docs/ANALYTICS.md` §2.4 与 §8 变更记录）。
7. **i18n key 调整**：`options.systemPrompt.desc` 由 `options.systemPrompt.cardDesc` 取代；
   新增 `options.saveBar.*`、`options.section.*.desc`、`options.connection.group*/param*/…Desc` 等。
