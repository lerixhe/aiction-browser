# AGENTS.md

## 项目
Chrome 扩展（MV3，WXT + React + TS）。划词 → 工具栏动作 → 悬浮对话面板。
AI 调用统一走 Vercel AI SDK：`shared/model-provider.ts` 按 provider 的 `npm` 字段选工厂
（openai / anthropic / google / deepseek / openrouter，兜底 openai-compatible），未手填端点时用 models.dev 的 `api`。
7 语言 i18n；内置 PDF viewer。路径别名 `~/*`、`@/*` → `src/*`。

## 命令
- `npm run dev` / `dev:firefox`、`build`、`zip`。
- **改代码后必须跑 `npm run typecheck` + `npm run build`**；动了 i18n 还要跑 `npm run check:i18n`。
- `npm test`（vitest）：单测固定 `environment: node`，`chrome.*` 由 `src/shared/auth/__tests__/chrome-stub.ts` 注入，
  不引 jsdom——组件行为走手测清单，别为了几行 DOM 断言引一整套浏览器环境。
- `npm run check:auth-boundary`：凭据边界检查（已在 `build` 前置里）。
- `npm run mock:api`：官方 API 本地 mock（`127.0.0.1:8787`，dev 下 `API_BASE` 指向它；`--selftest` 跑端点自检）。
  额度 / plan 数值均为占位符，真实值只由服务端下发。
- 素材 / 设计类：`icons`、`bundle-icons`（build 前置自动跑）、`screenshots`、`screenshots:frame`。

## 改什么必须同步什么
文档索引见 `docs/README.md`。

| 改动 | 同步项 |
|---|---|
| 设置页 UI（`entrypoints/options/`） | 先读 `docs/OPTIONS_UI.md`（行式布局、即时 vs 草稿、行 i18n、§7 新增设置项清单） |
| PostHog 埋点 | `docs/ANALYTICS.md` §2 事件清单 + §8 变更记录；必要时 `docs/PRIVACY_POLICY.md` 与 `about.telemetryDesc` 文案 |
| 素材工具 | `docs/TOOLING.md`（§1 工具矩阵、§3 已知未修问题、§6 变更记录） |
| 界面语言 | 见下文「i18n」三处改动 |
| 账号 / 登录（`src/shared/auth/**`、`ProviderConfig.kind`） | 先读 `.private-docs/LOGIN_IMPL_SPEC.md`；动了 auth 模块导出面要同步 `scripts/check-auth-boundary.ts` 的白名单 |

素材纪律：`scripts/` 下已有一整套生成上架素材与设计预览的工具，**不要重复造轮子**；
改 UI / 图标 / 文案后先查 `docs/TOOLING.md` §4「什么情况下要跑哪个工具」；
工具跑不起来 / 截到白图 / 图标离线空白时先照 §3 排查。
文案与设计输入的来源是 `store/listing.md` 与 `docs/gemini-promo-brief.md`（非代码资产）。

## 仓库边界（公开 / 私有）

本仓库是**公开仓库**（GPL v3，带 Chrome Web Store 入口）。下列内容一律不进仓库，放 `.private-docs/`
（已在 `.gitignore`）：

- 定价、套餐档位、各级额度数值、额度重置周期
- 风控阈值：匿名额度、IP / 设备限流、宽限期、重试与撤销策略
- 网关内部实现：配额预扣与回填、上游模型映射表、计费单位换算
- 商业判断与转化设计：流失点、付费墙位置、AB 意图
- 后端接口的完整契约：认证细节、数据库表结构、错误码全表

**客户端可公开**的只有三样：请求形态（路径 / 必需请求头）、错误码语义（哪类重试、哪类引导升级）、功能枚举。
其余「怎么计费、限多少、多少钱」都属于服务端。

**真正的高发区不是文档，是下面四处**（写完自查）：

| 位置 | 自查点 |
|---|---|
| `src/shared/i18n/locales/*.ts` | 文案不出现价格、次数、「免费 N 次」此类具体数值；额度只写定性描述或由服务端下发 |
| `store/listing.md` 与商店描述 | 只写能力，不写额度与价格 |
| 代码注释 | 解释「为什么」可以，不写「免费档给 N 次」 |
| `docs/` | 契约类文档只保留客户端须遵守的部分，服务端实现不入库 |

## 架构
三个运行时上下文，只通过消息通信：

| 上下文 | 职责 |
|---|---|
| content script（`entrypoints/content/`） | 选区检测、划词工具栏、悬浮面板；会话为每页内存态 |
| background（`entrypoints/background.ts`） | **唯一发起 AI 请求的地方**；PDF 右键菜单；models.dev 数据与缓存 |
| options / popup / pdf-viewer | 设置页、Popup（只做：确认引擎、在当前页面提问、动作开关）、PDF 阅读页 |

通信方式：
- **流式**：content 用 `chrome.runtime.connect` 开 `AICTION_STREAM` port，background `streamText()` 逐事件 postMessage。
- **非流式**（测 API、拉模型列表）：`sendMessage` + `sendResponse`。
- **Popup → content**：`chrome.tabs.sendMessage` 发 `AICTION_OPEN_CHAT`，content 同步应答（Popup 收到即关自己，把系统焦点还给页面）。
  该路径**不经 background**；页面没有可用 content script 时必须 reject，由 Popup 显式提示而非静默失败。

共享逻辑 `src/shared/*`：`storage`（含 `normalizeSettings` 合并）、`prompt`、`model-params`、
`models-dev` / `openrouter`、`chat-stream`、`analytics`、`errors`、`selection`、`messaging`、`i18n`。
共享 UI `src/shared/ui/*`：`tokens` / `styles` / `theme` / `icons` / `iconify` / `markdown` 等。

关键目录：
- `options/`：`OptionsPage`（PageShell 骨架 + hash 深链）、`ui/`（尺度 tokens、页面 CSS、primitives、shell）、
  `hooks/draft.ts`（单值/条目级草稿 + ⌘S）、`useProviderManager`、各分区卡片。
- `content/`：`components/`（`SelectionToolbar`、`ChatSession`、`ChatPanel`、`SpeechWidget`、`SpeechPlayer`、
  `floating.ts` 公共定位）、`hooks/`（`useChatSessions` / `useChatState` / `useSelectionDetection` /
  `useToolbarState` / `useSpeechPlayer`）、`utils/`。

## 不变量
1. AI 请求只在 background；content 只发消息。
2. 扩展 UI 根节点保留 `data-aiction-root="true"`；事件过滤一律用 `event.composedPath()`
   （Shadow DOM retargeting 会让 `event.target` 绕过根判断）。
3. background 的消息监听在模块加载期注册，不放进生命周期回调。
4. 自定义动作保存前校验 `{selection}` 占位符；旧 `{text}` 模板读取时自动迁移。
5. 会话是每页内存态：关闭即销毁、刷新即清空；**多实例并存**，新触发追加实例（递增 id 作 key）。
   同一动作同一选区的重复触发不新建实例，而是让已有卡片闪一圈脉冲（见「悬浮面板」）。
6. Popup 开出的空白会话：`initialPrompt` 为空串（既是防抖键，也表达「不自动发送」），
   `anchor: null`（回退视口上方居中），`initialMode: "chat"`（延时聚焦，等 Popup 交出焦点）。
7. **工具栏动作一律不关闭工具栏**（普通动作、朗读、复制都不调 `closeToolbar()`）；
   复制临时借用页面选区后必须原样还原。
8. 输入框 Enter 发送必须判 `nativeEvent.isComposing`（IME 组合确认不是发送）。
9. **凭据只在 background**：token 不进 `storage.sync`、不进消息负载、不进埋点、不进 DOM；
   `entrypoints/content/**` 与 `pdf-viewer/**` 只允许 import
   `@/shared/auth/{types,facade,use-auth-snapshot,actions}`，由 `scripts/check-auth-boundary.ts` 在 build 前强制。
   access token 放 `storage.session`（content 技术上读不到），refresh token 放 `storage.local`（只靠纪律）。

## 配置迁移与默认值
- 向 `DEFAULT_SETTINGS` / `DEFAULT_QUICK_ACTIONS` **加新项**：`normalizeSettings()` 必须按 id 合并
  默认值与已保存值（补缺），否则老用户永远拿不到新项。检查单：类型 → defaults → 校验 → **合并逻辑** → i18n。
- 改**已有默认项的内容**（内置动作 `label` / `template`、`DEFAULT_SYSTEM_PROMPT`）：用指纹表
  `LEGACY_BUILTIN_DEFAULTS` / `LEGACY_SYSTEM_PROMPTS`，逐字段判定「仍等于当前默认或任一历史默认」才写入新默认，
  否则保留用户自定义；`label` 与 `template` 独立判定。**每次替换默认值都要把旧值追加进指纹表**，
  否则那批用户永远停在上一个版本（旧模板按 `{selection}` 形式记录）。
- 空串 = 用户主动清空（运行时回退内置默认），不等于任何默认值，清空过的用户不会被写回。

## 模型上限参数：元数据是「provider 副本」的
models.dev / OpenRouter 的 `limit.output`、`top_provider.max_completion_tokens` 描述的是**某个 provider 副本**的能力，
同一模型可能同时存在多档（十几万到上百万），取到哪档取决于 provider 匹配命中哪个副本，**与用户实际端点无关**
（自定义 provider 无 `modelsDevId` 时走 OpenRouter 兜底，最容易命中最大档）。
- 智能填充只填语义明确的项（`reasoning`、`reasoningEffort`）；`maxTokens` / `contextSize` **刻意不自动填**
  （留空 = 跟随端点默认 / 不裁剪）。数据源里的数字只作为 UI 提示展示，文案须写明「以端点实际限制为准」。
- **不做静默降级重试**：端点拒绝某个可选参数时直接报错，让用户看到真实原因去设置里改。
  （曾实现过「去掉该参数重试一次」，已移除：请求翻倍 + 配置错误永远暴露不了。）

## 错误处理与埋点
只做两件事：
1. **原文全量上报**：`error_detail`（`error.message`）与 `response_body`（端点响应体）原样上传，
   唯一处理是抹凭据（`sanitizeErrorMessage`）+ 2000 字符截断。
2. **粗分类兜底**：`classifyChatError()` 只看 `error.name`、自有 `ERROR_MESSAGES.*` 常量比对、结构化 `statusCode`，
   都对不上就 `unknown`。

**禁止在任何错误文本上做结构 / 类型推断**：不正则抓状态码、不抠 JSON 的 `error.type`、不按关键词猜
`timeout` / `auth` / `rate_limit`。各家 provider 文案差异极大，猜出来的桶会误导分析（曾有关键词兜底，已删）。
上报统一走 `src/shared/analytics.ts`；出口 `sanitizeProperties()` 会剔除属性名含 `key` / `token` / `secret` 的字段。

## 流式请求：区分「超时」与「主动收尾」
带超时的流式调用有两处 `abort()`：超时定时器、流消费完后的主动收尾。两者都会让 `signal.aborted === true`，
用 `aborted` 判超时会把端点 400 的原文与 `http_status` 全部改写成「请求超时」。
- 定时器回调里先置布尔标志再 abort，`catch` 只认这个标志。
- AI SDK 在 `abortSignal` 触发时**不抛异常**，而是往 `fullStream` 发一个 `abort` part 后正常结束；
  只处理 `text-delta` / `error` 会把超时当成「流正常结束但零内容」（`no_content`）。
- 400/401 以 `error` part 送达；`start-step` 才代表 HTTP 已成功（用它判断「请求是否真的被接受」）。

## i18n
- **唯一真源 `src/shared/i18n/registry.ts`**（`id` / `tag` / `nativeName` / `promptName` / `messages`）：
  `Locale` 类型、默认语言、设置校验、下拉选项、提示词显示名全部由它派生，**别处不再列语言清单**。
  当前 7 个：`en` / `ja` / `ko` / `ru` / `vi` / `zh_CN` / `zh_TW`（数组顺序 = 下拉顺序 = 同分优先级 = 字母序）。
- 字典 `locales/<id>.ts`：`en` 是键集基准（导出 `MessageKey`），其余 `satisfies Record<MessageKey, string>`，
  缺键 / 多键 / 拼错键名都是编译错误。所有用户可见文案走 `t()`，不硬编码。
- 偏好 `settings.language`：`"browser"`（跟随浏览器 UI 语言）或某个 locale id。历史值 `"system"` 由
  `normalizeLanguagePreference()` 读取时迁移；已下线语言的存量值判为非法 → 回退自动项，**无需迁移代码**。
- **语言判定只看 `chrome.i18n.getUILanguage()`**，不读 `navigator.language`（macOS 上它反映系统语言，
  读进来会让「跟随浏览器」静默退化成「跟随系统」）；`chrome` 判定必须 `typeof chrome !== "undefined"`
  （可选链挡不住变量未声明的 ReferenceError）。标签解析交 `Intl.Locale.maximize()`，匹配从注册表派生：
  主语言筛候选 → script 冲突淘汰 → script/region 加分 → 同分取声明顺序。
- **禁止**：`startsWith("zh")` / 手撸子标签、书写系统黑名单、「哪些地区算简体」的名单、把自动项叫「系统」。
  典型坑：macOS 可能给 `zh-Hans-SG`，靠前缀判断会误判成英文，只能交给 ICU。
- **加一门语言**：① `locales/<id>.ts`（抄 `en` 翻译）② `public/_locales/<id>/messages.json`（商店元数据，
  名称 ≤45 / 描述 ≤132 字符）③ registry 追加一行。然后 `check:i18n` → `typecheck` → `build`。
  判定标准：**若还需改匹配 / 校验 / 下拉 / 提示词逻辑，说明派生链断了，先修派生链，别就地打补丁。**
- 占位符（`$1` / `{selection}`）原样保留；`previewTextZh` / `previewTextEn` 是按**语音语言**取用的试听句，
  不翻成 UI 语言。

## TTS 文本语言检测
- 主判断走平台能力 `chrome.i18n.detectLanguage()`（CLD3），无 chrome / 报错 → 回退 `navigator.language`。
  因此 `detectTextLocale()` / `resolveVoiceForText()` 是 async：`await` 之后必须重校验 generation，防旧回调写回。
- 标签 → 语音组用 `matchVoiceLocale()`（`Intl.Locale` 归一后按 language 4 / script 2 / region 1 打分，同分保留先出现者）。
  语音名 → 标签按 `locale-VoiceNameNeural` 取前两段，交 `parseLocaleTag()` 校验，不手写 `split("-")`。
- 只保留一条最小规则：粤语专用字（封闭字符集）→ `zh-HK`（CLD 对粤语只给 `zh` / `zh-Hant`，
  而粤语白话文用普通话语音朗读听感灾难）。这一步没有标准 API 可替代。
- 已知能力边界：CLD 对中文只返回 `zh`，**不区分简繁**，繁体文本会走 `zh-CN` 语音。不要用简繁字表去补（永远不全）。

## 悬浮面板（对话窗 / 朗读控件）
- **定位**：面板 = absolute + 文档坐标、随文档滚动；锚点是**触发时刻快照**的工具栏矩形，不跟随后的工具栏拖拽。
  公共逻辑 `components/floating.ts`：下方放不下翻到上方，两边都放不下收敛回视口，水平钳制在安全区内。
  对话面板定位于 anchor / resize / 形态切换时重算。**朗读控件是唯一例外**：fixed + 视口坐标、贴在视口顶部中间，
  滚动不重算（合成线程同步、零 JS）、只监听 resize。
- **两态**：卡片态（窄、只渲染 assistant 消息、无输入区、内容是淡底 + hairline 描边的内容块）↔
  聊天态（更宽、常规气泡 + 输入区）。同一会话实例，流式跨态继续渲染。新触发默认卡片态。
- **过渡**：只在 `morphing` 期间打开 width/height/left/top 过渡（含 `interpolate-size` 让 `auto` 参与插值）；
  拖拽与流式增高必须即时跟手，不能常开。位置随宽度一起过渡：未拖拽时按新宽度重算，已拖拽时由
  ResizeObserver 的宽度差补一半到 `left`。拖拽开始主动结束 `morphing`。`prefersReducedMotion()` 时直接跳变。
- **头部控件统一样式族**：`headerControlStyle()` 是形态切换 / 钉住 / 关闭三个按钮的唯一样式来源，新增按钮直接调它。
  状态只有两档：中性、`active`（主色淡底 + 主色描边 + 同色图标 + semibold），不设常亮按钮；
  图标传 `color="currentColor"` 与文字同色。**焦点环只在 `:focus-visible` 点亮**——鼠标点击也会 focus 且点完不 blur，
  常驻光环会被误读成第三种状态（输入框的聚焦柔光不受此限）。
- **模型名槽位**固定长度 + 右端 mask 渐隐，**不用 `text-overflow: ellipsis`**（省略号是硬截断符号、位置随名字长度跳动）。
  渐隐读作「后面还有，只是淡出」，截断位置恒定，头部布局不随模型名抖动；完整名字留在 `title` / `aria-label`。
- **拖拽边界是单一套软边界**：只保证「最小可抓取区」留在视口内，上缘不允许拖出视口，下/左/右允许溢出。
  不要求整块可见（展开态接近视口高度，那样垂直可拖范围只剩几十像素，观感就是拖不动），
  也不允许不限范围（拖出去就彻底抓不回来，只能刷新页面）。水平基准取**视口**而非文档宽度。
  钳制必须用面板**实测尺寸**（ResizeObserver 维护），不能用展开态的最大高度假设——否则矮卡片拖不到视口下方。
- **位置权归用户**：`draggedRef` 置位后 resize 只跑软边界，自动落位逻辑不再硬拽回视口。
- **防抖命中不能静默**：同 prompt 的会话已存在时，让那张卡片闪一圈主色脉冲（不动位置）。
  三个易踩点：① 脉冲层必须**常驻**，命中时 `animation: none` → 读 `offsetWidth` 强制回流 → 重赋动画，
  靠 React 重建节点或改 key 不会重播；② 闪的信号要绑在**已提交**的会话上，
  **绝不在渲染期间写 `sessionsRef.current`**（并发渲染被丢弃会留下从未提交的快照，据此算出的 id 匹配不上就不闪）；
  ③ 面板 `overflow: hidden`，光晕用 `inset` 否则被裁。**不要顺手把卡片拉回视口**（位置是用户的）。
  防抖判定必须放在**任何 await 之前**并同步建实例，否则 await 窗口里的第二次点击会双通过、连开两张。
- **Esc 统一在 `useChatSessions` 监听**，逐面板监听会一次按键连环关闭所有面板；IME 组合中的 Esc 忽略。
  点外关闭必须用 `composedPath()` 忽略扩展 UI 内部点击（面板开着时点工具栏换动作是常态）。
- **收起必须 blur 面板内焦点**：DOM 仍在（仅 opacity 0 + pointerEvents none），焦点残留会让后续按键落入虚空。
  容器用 `onFocusCapture` 记录焦点元素。
- **朗读控件交互**：小圆球态 ⇄ 悬停 / 点击展开控制条，鼠标移出延时收起，触发后一段时间无交互也自动收起；
  morph 用 left/top 与宽高一起过渡、以自身中心为轴，**不要用 transform 补偿**（与入场 keyframes 打架）。
  拖动进度条期间用 hold/release 抑制自动收起；焦点在文本输入类控件时不收起。
  取色一律用主题的 `accent.primary`（品牌/交互色，含「播放完毕」的对钩而不是 success 绿），
  失败态才保留 `state.error`。退场计时器与倒计时圆环同帧启停，
  **退场时长常量在两个文件各定义一次，改要同步改**。
- **失败态 CTA** 只在 `no_api_key` / `auth` / `quota_exceeded` 三种归因下出现，落点是
  `OPEN_OPTIONS#account` 或定价页；点击**不关闭面板**（`data-failure-cta` 供样式与测试定位）。
  其余失败（超时 / 网络 / 端点）不给 CTA——把失败都变成推销等于另一种静默失败。
- 层级：工具栏 `uiLayer.overlay` > 面板 `uiLayer.panel`。
- 拆组件时 `<style>` 里的全局样式（`@keyframes` 等）容易整块丢失（不报错、动画静默失效），拆前列清单指定归属。

## 选区检测
Shadow DOM 下 `document.activeElement` 不可靠，要穿透嵌套 `shadowRoot` 深查；事件过滤用 `composedPath()`；
工具栏 / 面板输入框内的选区变化不得更新页面选区上下文、锚点或工具栏可见性；扩展内部交互期间的瞬时选区丢失
不能让工具栏消失。调选区 bug 前先确认扩展已重载 + 页面已刷新（旧注入代码是常见原因）。

## UI 布局硬约束
- Popup 宽度 360；动作列表可视高度 204（6 × 34），筛选条仅在动作 > 6 个时出现；
  动作再多内部滚动，总高不随动作数增长（Chrome popup 上限 600px）。
  **新增元素一律不占纵向空间**：账号控件（登录按钮 / 头像 + 套餐徽标）在头部右端，
  高 22 与品牌图标齐平，头部高度恒为 34（22 + paddingBottom 12）。
  跳设置页前先 `await` 写 `OPTIONS_ENTRY_STORAGE_KEY`，再 `window.close()`。
- 对话面板宽度受视口约束（下限 320）；卡片态比聊天态窄一档，聊天态要放得下更长的追问与输入区。
- 输入框自增高（24 → 132，超出内部滚动），Enter 发送 / Shift+Enter 换行。

## 图标
- 源 `logo_raw.jpg`（满版方形、不透明四角、≥1024）→ `npm run icons`（sharp `lanczos3`、64 色调色板）→
  `src/assets/icon.png`(512) + `store/icons/*`；构建时 auto-icons 生成 16/32/48/128。
  **不要手改产物，不要用 `qlmanage` / `sips`**；满版方形不做圆角裁剪（Chrome 会自行套圆角）。
- 运行时：`bundled-icons.ts`（**生成物，勿手改**，内置 ~106 项）在模块加载时 `addCollection`；
  用户图标从 `chrome.storage.sync` 的 `aiction:icons` 懒加载，选中新图标时 fetch SVG → `saveUserIcon()`。
  预算：内置 ~22KB、单图标 ~200B、上限 50。
- 导出 / 导入设置要连 `userIcons` 一起走；`handleIconSelect` 是 async，**必须先 await 再保存设置**。

## 开发教训（抽象版，都是踩过的坑）
1. **枚举 ≠ 平台能力**：语言标签、语言检测、易读格式这类标准问题交给 `Intl.Locale` / CLD / 平台 API。
   字符串前缀判断与 Unicode 区段正则永远不全，且是猜测式编码。
2. **不要静默降级 / 静默失败**：能报错就报错（见「错误与埋点」「模型上限参数」）；防抖命中要给可见反馈。
3. **声明了却没绑到元素的 ref 是纯静默死代码**（`ref.current?.focus()` 全部 no-op，无报错无警告）。
   对 ref 起疑先 `rg "ref=\{.*Ref\}"` 确认已绑定；依赖 ref 的交互（聚焦 / 测量 / 滚动）必须在能读
   `activeElement` / `getBoundingClientRect()` 的环境里断言，肉眼看 UI「差不多」验不出来。
4. **JSX「幽灵报错」（少一个 `}`）**：TS 报「no corresponding closing tag」但报错行看着完全正常。
   用 TypeScript Compiler API dump `parseDiagnostics` + AST 节点 span 定位，别肉眼数括号。
   相关：多段 edit 是**原子性**的，任一 oldText 不匹配整次回滚，失败后要重读文件确认实际状态；
   编译验证二分时用**错误码**过滤 tsc 输出（用文件名过滤会在 `/tmp` 路径下静默假阴性）。
5. **hook 声明顺序**：后声明的 callback 被先声明者依赖时，依赖数组里处于 TDZ，运行时 ReferenceError。

## 待优化
- 无障碍：状态变化无 `aria-live` 播报；面板 / 圆球无键盘入口（Tab 不可达）。
- 打磨：消息区滚动条颜色 hardcoded 未适配 dark；朗读控件收起与悬停手感待实测微调；对话窗支持拖拽但不支持 resize。

## 验证
- build 后加载 `.output/chrome-mv3` 为 unpacked；**重载扩展后必须刷新目标页**，必要时关掉重开标签
  （旧 content script 实例会残留）。background 改动在 service worker inspector 看。
- content script 不在 `data:` / `chrome://` / 商店页运行，用真实 `http://127.0.0.1:<port>` 页验证，
  并确认注入的 shadow host 存在。
- `npm run build` 会先跑 `bundle-icons`（tsx）；沙箱里报 `listen EPERM` 是环境问题，换本机 shell 重试。
- **自动化加载扩展**：系统 Chrome 已忽略 `--load-extension`，改用 Playwright 缓存里的 Chrome for Testing
  二进制（`~/Library/Caches/ms-playwright/chromium-*/chrome-*/…/Google Chrome for Testing`），
  配合 `--disable-extensions-except` + `--load-extension`、`headless: false`。
  确认扩展身份读 `chrome.runtime.getManifest()`（别信第一个 `chrome-extension://` target，可能是内置组件扩展）；
  SW 可直接 `evaluate()` 调 `chrome.i18n.*`，是验证 CLD / i18n 行为最快的手段。
- 合成页测试（注入 built `content.js` + stub `chrome.runtime` / `storage` / `i18n`）只验证 bundle 行为，
  不证明 manifest 注入。
- 断言要覆盖双向结果：复制 = 剪贴板内容正确 **且** 工具栏仍可见；文案断言要考虑 i18n（aria-label 随语言变）。
- 收尾：删临时脚本、停本地服务、清理临时 profile。

## 参考资料
`reference/` 下有两个同类扩展项目（见 `reference/README.md`）；对组件结构、消息通信、UI 方案没把握时先看它们。
