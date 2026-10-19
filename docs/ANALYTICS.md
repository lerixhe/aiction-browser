# 数据埋点（Analytics）总览

> **本文档是长期维护文档，不是临时梳理。**
> 任何新增 / 修改 / 删除埋点的 PR，必须同步更新本文档（见文末「维护流程」）。
> PostHog 项目上的 Dashboard / Insight 命名也应与本文档的事件名一一对应。

| 项目 | 值 |
|------|-----|
| 最后更新 | 2026-10-19（对照 `package.json` version `0.5.0`） |
| 数据接收端 | PostHog（`https://us.i.posthog.com`，项目 token 常量见 `src/shared/analytics.ts`） |
| 埋点唯一入口 | `src/shared/analytics.ts`（所有上报必须经过它，禁止在业务代码里直接 `fetch` PostHog） |
| 事件定义分散位置 | content / pdf-viewer / popup / options / background（见下方清单） |
| 当前事件数 | 40 |
| 用户开关 | `settings.telemetryEnabled`（Options → 关于 → 协助改善用户体验，默认 `true`） |
| 隐私承诺 | `docs/PRIVACY_POLICY.md`「Analytics Provider: PostHog」章节 |

---

## 1. 采集机制

### 1.1 两条上报通道

```
                      ┌──────────────────────────── content script / pdf-viewer / options ────────────┐
业务代码 ── trackEvent() ──→ posthog-js（module.no-external）──→ /capture/（SDK 内部）
                      └───────────────────────────────────────────────────────────────────────────────┘

                      ┌──────────────────────────── background service worker ────────────────────────┐
业务代码 ── trackBackgroundEvent() ──→ fetch(`${POSTHOG_HOST}/capture/`)（手写 HTTP，带 $lib=aiction-background）
                      └───────────────────────────────────────────────────────────────────────────────┘
```

| 通道 | 函数 | 使用场景 | 实现 |
|------|------|----------|------|
| SDK | `trackEvent(name, props)` | content script、pdf-viewer、options、popup | lazy 初始化 `posthog-js`，`persistence: "memory"` |
| HTTP | `trackBackgroundEvent(name, props)` | background service worker（生命周期、API 测试、TTS、PDF 入口） | 直接 POST `/capture/`，逐条即时发送 |

- `startBackgroundBatching()` / `stopBackgroundBatching()` 目前是 **no-op 占位**（未使用 `/batch/` 批量上报），保留接口以便将来改造。
- SDK 初始化选项：`autocapture: false`、`capture_pageview: false`、`capture_pageleave: false`、`disable_session_recording: true`、`advanced_disable_decide: true`。
  → **PostHog 里不会有自动事件（无 `$pageview` / 无录屏 / 不拉远端配置）**，所有数据都来自本文档列出的显式事件。
- 辅助函数：
  - `trackFirstTimeEvent(onceKey, name, props)`：只在 `onceKey` 首次出现时上报（content 系上下文用）。
  - `consumeFirstTimeFlag(key)`：一次性标记原语（background 与 `trackFirstTimeEvent` 共用；`ActionsSection` 用它标记「首次创建自定义动作」）。
  - background 侧需要一次性事件时：`consumeFirstTimeFlag()` + `trackBackgroundEvent()` 组合。

### 1.2 身份、标记与去重

| storage.local 键 | 内容 | 写入者 |
|------------------|------|--------|
| `aiction:anonymousId` | 匿名 ID（`crypto.randomUUID()`），SDK 用它 `identify()` | `getAnonymousId()` |
| `aiction:first:first_action_clicked` | 首次触发动作的里程碑标记 | `trackFirstTimeEvent()` |
| `aiction:first:provider_configured` | 首次配置出可用 provider 的里程碑标记 | `background.ts` `reportProviderConfigured()` |
| `aiction:first:custom_action_created` | 首次创建自定义动作的标记（→ `action_created.is_first_custom`） | `ActionsSection.tsx` `handleAddAction` |
| `aiction:optionsEntry` | Options 页入口标记（`popup`），Options 读取后立即清除 | `Popup.tsx` → `OptionsPage.tsx` |
| `aiction:lastActiveDate` | 上次上报活跃的本地日期（`YYYY-MM-DD`） | `background.ts` `reportDailyActive()` |

- 不含任何真实身份、登录信息；扩展无账号体系。
- 一次性事件用标记位控制，跨会话/跨页面只计一次；属性里同时带 `is_first: true` 或 `is_first_custom: true`，便于直接切分。
- 注意：SDK 用 `persistence: "memory"` + 无 pageview，PostHog 侧的「Session」概念对扩展场景基本失效 → 涉及会话的指标靠自定义事件（`daily_active`，见 §2.1），Dashboard 配置见 §6。

### 1.3 开关与隐私边界

- 每次上报前都会读 `chrome.storage.sync` 的 `aiction:settings.telemetryEnabled`（`isTelemetryEnabled()`），为 `false` 时直接 return，**不初始化 SDK、不发送任何请求**。
- 关闭路径只有一处：Options → 关于 → 遥测开关（`AboutSection.tsx`），**该开关的变更事件与上报顺序见 §2.7 `telemetry_toggled`**。
- **承诺不上报**：选中文本原文、页面 URL / 标题、API Key、模型输出内容、系统提示词内容。
- **用户自由文本一律不上报**（2026-10-18 起全面执行）：
  - 动作的 `label` / `template` → 改为 `label_length_bucket` / `template_length_bucket` / `has_selection_placeholder` / `changed_fields`；
  - provider 展示名（自定义名可能是用户填写的文本）→ 改为 `provider_type` + `models_dev_id`。
  - 已上报属性现在只包含：ID、枚举、数量、长度分桶、布尔、耗时。原 `action_clicked.custom_action_labels` 与 `provider_switched.from/to_provider` 已移除（见 §8 变更记录）。

---

## 2. 现存事件清单（共 40 个）

> 表格中的「触发位置」写函数/组件名而非行号，避免代码变动后失效。

### 2.1 扩展生命周期与活跃（background / HTTP）

| 事件名 | 属性 | 触发位置 | 用途 |
|--------|------|----------|------|
| `extension_installed` | `version` | `background.ts` → `chrome.runtime.onInstalled`（reason=install） | 安装量 |
| `extension_updated` | `version`, `previous_version` | 同上（reason=update） | 版本升级分布 |
| `daily_active` | `version` | `background.ts` `reportDailyActive()`：SW 顶层启动 + `chrome.runtime.onStartup` | **DAU / 留存**（唯一口径为「日活」的事件） |

`daily_active` 口径说明：
- 「SW 被唤醒的那一天」算一次活跃——浏览器启动、点开 Popup、划词触发请求都会唤醒 SW，因此它约等于「当天用过扩展」。
- 去重两重：同一 SW 实例内用模块级 promise，跨实例用 `storage.local` 的 `aiction:lastActiveDate`（**本地时区**日期，避免 UTC 把东部时区的凌晨算到前一天）。
- 只上报 `version`，不携带任何页面 / 使用细节（细节由其它事件承担）。

### 2.2 激活与入口漏斗（P0，2026-10-18 落地）

| 事件名 | 属性 | 触发位置 | 用途 |
|--------|------|----------|------|
| `first_action_clicked` | `action_id`, `is_custom`, `source`, `is_first: true` | `content/App.tsx` `handleAction`；`pdf-viewer/PdfViewer.tsx` `handleAction`（经 `trackFirstTimeEvent` 只报一次） | 激活里程碑：多少设备**真的用过**一次动作 |
| `provider_configured` | `provider_type`(`models_dev`/`custom`), `models_dev_id`(仅 models_dev), `trigger`(`api_test`/`chat`), `provider_count`(trigger=chat 时), `is_first: true` | `background.ts` `reportProviderConfigured()`：① API 测试成功分支 ② 首次对话成功产出内容后 | 装 → 配好 → 能用的转化；只算一次，`trigger` 区分用户是「测过连接」还是「直接对话成功」 |
| `action_triggered_without_provider` | `source` | `background.ts` `streamChat`（`activeService.apiKey` 为空的分支） | **关键流失点**：装了但没配 provider 就触发动作 |
| `popup_opened` | `source: "popup"` | `popup/Popup.tsx` 挂载 | Popup 使用量（入口取舍依据） |
| `popup_ask_clicked` | `result`(`opened`/`unsupported`), `source: "popup"` | `popup/Popup.tsx` `handleAsk`（`requestOpenChatInActiveTab()` 成功 / 被 reject 两个分支） | 「在当前页面提问」入口的可用率：`unsupported` 即页面没有可用的 content script（`chrome://`、扩展商店、未刷新的旧标签页），用来判断这条入口的失败面有多大 |
| `options_opened` | `entry`(`popup`/`direct`), `source: "options"` | `options/OptionsPage.tsx` 挂载（读 `aiction:optionsEntry` 后清除） | Options 到达率；`entry` 区分是否由 Popup 跳转 |
| `pdf_viewer_opened` | `scheme`(`file`/`http`) | `background.ts` `contextMenus.onClicked`（`open-pdf-with-aiction` 命中且拿到 URL 时） | PDF 场景使用量（决定是否继续投入 PDF 阅读器） |

实现说明：
- `source` 的取值类型是 `AnalyticsSource`（`"web" | "pdf" | "popup" | "options" | "background"`，定义在 `analytics.ts`）。background 侧通过 `resolvePortSource(port)` 由 port 来源页面推导（PDF 阅读器是扩展页面 → `pdf`，其余 → `web`）。
- `provider_configured` 不用「保存 provider 时」触发：保存 ≠ 可用（Key 可能无效、模型可能不存在），只有真实请求成功才算配好。
- `action_triggered_without_provider` 只在 background 上报一次，content 侧的「未配置」提示沿用同一路（不再重复上报，避免双计数）。
- `options_opened.entry` 目前只有 `popup` / `direct` 两种（首次安装手动进设置页无法与普通入口区分）。

### 2.3 核心使用行为（content script + pdf-viewer，共用同一套事件名）

| 事件名 | 属性 | 触发位置 | 用途 |
|--------|------|----------|------|
| `action_clicked` | `action_id`, `is_custom`, `custom_action_count`, `source`(`web`/`pdf`) | `content/App.tsx` `handleAction`；`pdf-viewer/PdfViewer.tsx` `handleAction` | 各动作使用频次，可按来源与自定义/内置拆开 |
| `quick_action_clicked` | `action_type`(`copyToClipboard`/`speakText`), `source` | 两处的 `handleQuickAction` | 快捷动作使用量（**朗读是否被触发也靠这里**） |
| `free_input_submitted` | `input_length`, `source` | 两处的 `handleFreeSubmit` | 自由输入（追问输入框）使用量 |
| `selection_toolbar_shown` | `source`, `char_length_bucket` | `hooks/useToolbarState.ts` `openToolbar`（5s 节流，同页连续划词只留一条） | **划词流失率**：工具栏出现次数 vs `action_clicked` 次数（只上报长度分桶，不报选区内容） |

- 动作身份只靠 `action_id`（内置 = `explain` / `translate`；自定义 = `custom-<timestamp>`）+ `is_custom` 表达，**不再上报动作文案**（内置动作的本地化 label 也一并去掉，避免维护两个会漂移的维度）。
- `is_custom` 判定统一走 `isBuiltinActionId()`（`src/shared/defaults.ts` 的 `BUILTIN_ACTION_IDS`），不要再在业务代码里手写 `new Set(["explain", "translate"])`。

### 2.4 自定义 Actions 管理（options / popup，P1，2026-10-18 落地）

| 事件名 | 属性 | 触发位置 | 用途 |
|--------|------|----------|------|
| `action_created` | `is_first_custom`, `total_actions`, `custom_count`, `source` | `CustomActionsCard.tsx` `handleAddAction` | 多少人会创建自定义动作、平均建几个；`is_first_custom` 由 `aiction:first:custom_action_created` 标记控制 |
| `action_updated` | `is_custom`, `changed_fields`(`["label"]`/`["template"]`/两者), `has_selection_placeholder`, `template_length_bucket`, `label_length_bucket`, `enabled`, `source` | `CustomActionsCard.tsx` `updateActionDraft` → `recordActionEdit` → `flushActionEdits` | 用户改文案还是改模板、模板是否带 `{selection}`、模板有多长（**不含文本本身**） |
| `action_deleted` | `is_custom`, `remaining_actions`, `remaining_custom`, `source` | `CustomActionsCard.tsx` `handleDeleteAction` | 删除率；内置动作也能删（`is_custom: false` = 删掉的是内置动作），因此该属性有区分价值 |
| `action_reordered` | `from_index`, `to_index`, `source` | `CustomActionsCard.tsx` `handleActionDragEnd`（仅位置真的变化时） | 是否在意动作顺序（决定拖拽排序是否值得维护） |
| `action_enabled_toggled` | `scope`(`options`/`popup`), `enabled`, `is_custom`, `source` | `CustomActionsCard.tsx` `toggleActionEnabled`（左列表开关；启用是即时项）、`Popup.tsx` `handleActionToggle` | 启用/禁用行为分布，以及用户主要在哪个界面做这件事 |
| `action_icon_changed` | `icon_source`(`bundled`/`iconify`), `icon_name`, `is_custom`, `source` | `CustomActionsCard.tsx` `handleIconPick`（预置库与搜索结果共用） | 图标来源分布（`iconify` = 走远程 API 拉取），以及是否有人真的换图标 |

实现说明：
- **`action_updated` 是聚合上报**：`updateActionDraft` 只在 ref 里记录「哪个动作的哪些字段被改」，并在
  2s 静默（`ACTION_EDIT_FLUSH_MS`）、保存该动作、删除该动作前、切换设置分区（组件卸载）时统一 flush，避免逐字上报。
- 属性里取的是 **flush 时刻的最新值**。设置页改造后名称 / 模板改为草稿（不再逐字落盘），因此 flush 读的是
  「草稿优先、回落已保存值」的有效值（`draftsRef` 通过 `useEffect` 同步，不在渲染期间写 ref），
  否则长度分桶 / 占位符属性会报出旧的已保存值。
- `lengthBucket()`（`src/shared/analytics.ts`，全项目共用）：`0` / `1-20` / `21-60` / `61-200` / `200+`。
- 图标名（`tabler:xxx` / `logos:xxx`）是预设枚举而非用户文本，可以上报；**用户的图标搜索关键词不上报**。
- `handlePreview`（ActionsSection）是 **TTS 试听**而不是动作模板预览，因此没有 `action_template_previewed` 事件；若要统计试听，应新增 `tts_preview_played`（见 §5 P3 剩余候选）。

### 2.5 对话流与面板交互（content script）

四个 chat 事件共用一套维度（由 `useChatState.ts` `sendPrompt` 内的 `chatProps()` 统一构造）：

| 事件名 | 属性 | 触发条件 |
|--------|------|----------|
| `chat_completed` | `model`, `provider_type`, `source`, `turn_index`, `is_follow_up`, `ttft_ms`(仅收到过内容块时), `duration_ms`, `content_length` | 流式正常结束 |
| `chat_cancelled` | 同上（无 `content_length`） | 流式被 abort |
| `chat_failed` | 同上 + `error_code` | 流报错 或 catch 异常（两处上报） |
| `chat_stopped_by_user` | `model`, `provider_type`, `source`, `turn_index`, `elapsed_ms` | `useChatState.ts` `stopStreaming`（**仅用户点停止按钮**；关闭面板导致的 abort 走卸载清理，不上报本事件） |

面板形态：

| 事件名 | 属性 | 触发位置 | 用途 |
|--------|------|----------|------|
| `chat_panel_mode_toggled` | `to_mode`(`card`/`chat`), `streaming`, `source` | `ChatPanel.tsx` `handleToggleMode` | 卡片态↔聊天态切换率；`streaming` 区分「生成中展开去追问」与「只是想看全貌」 |

维度说明：
- `source`：`web` / `pdf`（由 `ChatSession` 的 `source` prop 传入），用于对比网页与 PDF 阅读器的使用深度。
- `turn_index` / `is_follow_up`：本次是会话里的第几轮（`1` = 触发动作的首轮，`>1` = 追问）——卡片的「追问」入口到底有没有人被用。
- `ttft_ms`：首个内容块（含思考块）到达耗时——比 `duration_ms` 更能反映「是不是卡住了」。
- `provider_type`：`models_dev` / `custom` / `none`（依旧不上报 provider 名称）。
- `error_code`：`ChatErrorCode` 枚举（`classifyChatError()`，`src/shared/errors.ts`）：
  `no_api_key` / `missing_config` / `no_content` / `timeout` / `auth` / `rate_limit` / `network` / `aborted` / `provider_error` / `unknown`。
  优先用 background 在 `ChatStreamFailedEvent.code` 里给出的结构化归因，缺省时在 content 侧按状态码 / 本地化常量 / 关键词兜底分类。
- `chat_stopped_by_user` 与 `chat_cancelled` 的关系：用户停止 → **两个事件都会上报**（一个是「用户意图」，一个是「流的终态」），比值即「被停止占比」。

仍未覆盖：chat 事件本身不带 `panel_mode`（若要按卡片/聊天态拆分聊天指标，需把 mode 也传进 `useChatState`）。

### 2.6 Provider 配置（options page）

| 事件名 | 属性 | 触发位置 | 用途 |
|--------|------|----------|------|
| `provider_created` | `provider_type`(`custom`/`models_dev`), `models_dev_id`(仅 models_dev), `provider_count`, `source` | `options/useProviderManager.ts` `selectProviderAndCreate` / `selectModelsDevProvider` | 用户偏好哪类服务商 |
| `provider_switched` | `from_provider_type`, `to_provider_type`(`models_dev`/`custom`/`none`), `to_models_dev_id`(仅 models_dev), `provider_count`(仅 options), `source`(`options`/`popup`) | `options/useProviderManager.ts` `toggleProviderActive`；`popup/Popup.tsx` `handleProviderChange` | 切换行为（**不再上报展示名**）；`source` 区分用户主要在哪个界面切换 |
| `api_test_completed` | `success`, `latency_ms` | `background.ts`（消息处理 `AICTION_API_TEST`） | 连通性成功率与延迟 |
| `model_selected` | `provider_type`, `source_list`(`models_dev`/`fetched`/`manual`), `from_search`, `model`(仅列表选择), `source` | `options/ModelPicker.tsx`（三条选择路径：devModels 列表点选 / 接口拉取的下拉 / 手输框 blur 且值真的变了） | 最常用模型排行；`from_search` 说明用户是靠搜索还是浏览；手输路径**不上报模型名** |

缺口：模型参数（`ModelParamsEditor.tsx`）**完全没有埋点**。

### 2.7 设置与个性化（options page）

| 事件名 | 属性 | 触发位置 | 用途 |
|--------|------|----------|------|
| `theme_changed` | `from_theme`, `to_theme` | `options/AppearanceSection.tsx` | 主题偏好 |
| `language_changed` | `from_language`, `to_language` | 同上 | 语种分布（i18n 优先级依据） |
| `system_prompt_save` | `is_empty`, `is_default`, `length_bucket`, `used_placeholders`(token 数组), `source` | `options/SystemPromptSection.tsx` `handleSave` | 有多少人真的自定义了系统提示词、用了哪些占位符（`is_default` = 改完又改回默认；`is_empty` = 清空以回退内置模板） |
| `system_prompt_reset` | — | 同上 | 恢复默认 |
| `settings_exported` | `provider_count`, `action_count` | `options/BackupSection.tsx` | 备份行为 |
| `settings_imported` | `provider_count`, `action_count`, `has_user_icons` | 同上 | 迁移/多设备 |
| `telemetry_toggled` | `enabled`, `source` | `options/AboutSection.tsx` `handleTelemetryToggle` | **遥测关闭率**（隐私信任指标） |

`telemetry_toggled` 的上报顺序是要紧的（这个开关本身会影响上报）：
- **关闭**：先 `await trackEvent(...)`（比时 `isTelemetryEnabled()` 仍为 true）再落盘——反过来会被自己的开关拦掉；
- **开启**：先落盘（幂等重写一次以便 `await`）再上报——落盘前开关还是 false，反过来同样报不出去。

### 2.8 TTS 与朗读链路（background + content）

| 事件名 | 属性 | 触发位置 | 用途 |
|--------|------|----------|------|
| `edge_tts_synthesize` | `success: true` → `bytes`；`success: false` → `error`（截断 200 字符） | `background.ts`（消息处理 `AICTION_TTS_SYNTHESIZE`） | Edge 在线语音可用性与成功率（设置页的试听也走这条） |
| `speech_started` | `source`, `provider`(请求的引擎 `edge`/`system`), `char_count_bucket`, `rate`, `chunk_count` | `useSpeechPlayer.ts` `start`（读完设置、开始合成/播放前） | 朗读触发量、文本长度分布、语速偏好 |
| `speech_finished` | `source`, `provider`(**实际**引擎), `char_count_bucket`, `rate`, `interrupted`, `duration_ms` | `useSpeechPlayer.ts` `reportSpeechEnd`（自然播完 → `interrupted: false`；未播完就被关掉 → `true`） | 朗读完成率（`interrupted: false` 占比）；`provider` 是实际引擎，能看出 edge 降级到 system 的比例 |
| `speech_dismissed` | `source`, `elapsed_ms` | `SpeechWidget.tsx` 闲置退场计时器（finished + 圆球态闲置 `TTS_DISMISS_MS` = 5s） | 控件存活时长：听完放着不管 vs 当场关掉 |

说明：
- 朗读目前只在 content script 侧（`App.tsx` `handleQuickAction`）触发，`source` **恒为 `web`**（PdfViewer 尚未接入朗读）；属性保留以便将来支持。
- `speech_started.provider` 是请求的引擎；`speech_finished.provider` 是实际引擎——edge 合成失败会降级到系统语音，降级时会把会话内的 engine 同步改写（这也修掉了降级后暂停/续播仍按 `<audio>` 分支走的旧问题）。
- 每次朗读只报一次终态：`finishReportedRef` 保证「自然播完」与「中途关闭」不重复计数（播完后闲置退场不会再报 `interrupted`）。
- `duration_ms` 是从开始朗读（含合成等待）到终局的墙钟时间，会包含用户暂停的时间。

未覆盖：播放中的控制操作本身没有任何事件（暂停/继续、拖进度、换语音、换语速）——见 §5 P3 候选。

---

## 3. 属性规范（新增埋点必须遵守）

1. **命名**：事件名 `snake_case`，`<对象>_<动作>`（过去式，如 `action_created`）或名词式状态（如 `api_test_completed`）。属性名同样 `snake_case`。
2. **类型**：只允许 string（枚举/ID） / number / boolean。数组仅用于枚举量小的键集合（如 `changed_fields`、`param_keys`）。
3. **禁止上报**：任何自由文本（用户输入、动作 label/template、选中内容、API Key、provider 自定义名等），任何 URL / 域名 / 页面标题，任何模型输出。
   - 需要刻画「长什么样」时，用**长度分桶**（`lengthBucket()`，`src/shared/analytics.ts`：`0`/`1-20`/`21-60`/`61-200`/`200+`）、**布尔特征**（`has_selection_placeholder`）、**枚举来源**（`icon_source`、`provider_type`）替代。
4. **来源维度用 `source`**，取值为 `AnalyticsSource`：`web` / `pdf` / `popup` / `options` / `background`。
5. **一次性事件**（如「首次触发动作」「首次创建自定义动作」）用 `consumeFirstTimeFlag` / `trackFirstTimeEvent` 打标，避免按页面重复计数；属性里带 `is_first` 便于切分。
6. **不要为埋点阻塞主流程**：一律 `void trackEvent(...)`；埋点失败只 `console.warn`，不影响功能。Popup 场景要特别注意：**先上报再 await 落盘**（window 随时会关）。
7. **输入类控件的编辑不要逐字上报**：用「记 ref + 静默窗口 flush + 卸载 flush」的聚合模式（见 §2.4 `action_updated`）。
8. **改属性不要破坏已有口径**：优先「追加」，必须移除旧属性时在 §8 记录并在 PostHog 侧同步改图表。
9. 新增事件时，属性尽量带**同一套维度名**（`source`、`model`、`provider_type`、`is_custom`、`enabled`、`turn_index`、`error_code`），便于交叉分析。

---

## 4. 工程建议（与事件无关，但影响数据质量）

| 问题 | 现状 | 建议 |
|------|------|------|
| Dev 环境污染数据 | `analytics.ts` 无环境判断，`npm run dev` 的本地调试同样上报 | build-time 关闭：在 `analytics.ts` 顶部加 `const ANALYTICS_DISABLED = import.meta.env.DEV`（或 WXT 的 manifest 环境变量），为 true 时所有 track 直接 return |
| 事件名漂移 | 事件名硬编码在十余个文件里（口径靠人肉记） | 新建 `src/shared/analytics-events.ts` 集中导出事件名常量与属性类型，业务侧只引常量（配合本文档 §2 一起 review） |
| 无统一属性校验 | 谁都能塞任意字段 | 在 `trackEvent` 里加 dev-only 白名单警告（打印出现未知属性），防止自由文本漏进去 |
| background 逐条 HTTP | 每个事件一次 `fetch`，SW 可能被回收 | 事件量上升后再考虑改为 `/batch/`（`startBackgroundBatching` 已留接口），或在 SW 内做内存队列 + 定时 flush |
| Popup 上报时机紧 | Popup 关闭很快，SDK 初始化是异步的 | 若 `popup_opened` 数据明显偏少，改用 `trackBackgroundEvent` 或先 `chrome.runtime.sendMessage` 交给 SW 上报 |
| 文档与 Dashboard 脱节 | 建图清单已落在 §6（含登记表） | Dashboard 建好后回填 §6.7 链接；后续改事件属性时同步改对应 Insight |

---

## 5. 建议新增的埋点（按优先级）

### P0 — 激活漏斗 ✅ 已实现（2026-10-18）

见 §2.2：`first_action_clicked`、`provider_configured`、`action_triggered_without_provider`、`popup_opened`、`options_opened`、`pdf_viewer_opened`，并为 §2.3 三个核心行为事件补上 `source`。

实现时的两点取舍（与最初设想的差异，后续如需可再补）：
- `provider_configured` 的原设想是「保存 provider 且 apiKey 非空 / API 测试成功」，实际改为「API 测试成功 **或** 首次对话成功」——保存不代表可用，而很多用户根本不点「测试连接」。属性里的 `trigger` 保留了这条区分。
- `action_triggered_without_provider` 只在 background 上报，content 侧不重复上报。

### P1 — 用户自定义 Actions ✅ 已实现（2026-10-18）

见 §2.4：`action_created`、`action_updated`、`action_deleted`、`action_reordered`、`action_enabled_toggled`、`action_icon_changed`。

同一批完成的隐私改造（原计划列的「必须改造已有两处」）：
- `action_clicked` / `first_action_clicked`：去掉 `action_label` 与 `custom_action_labels`，改为 `is_custom` + `action_id`；
- `provider_switched`：去掉 `from_provider` / `to_provider` 展示名，改为 `from/to_provider_type` + `to_models_dev_id`；`provider_created` 的 `provider_name` 改为 `models_dev_id`。

与最初设想的差异：
- 原计划的 `action_template_previewed` **不成立**（`handlePreview` 是 TTS 试听），改为候选 `tts_preview_played` 归入 TTS 缺口。
- `action_updated` 没有用 blur 触发，而是「静默窗口聚合 + 删除前 flush + 卸载 flush」，覆盖了面板内直接切换动作、切设置分区的路径。

### P2 — chat 维度、划词流失率与朗读链路 ✅ 全部实现（2026-10-18）

已完成：
- `selection_toolbar_shown`（划词流失率，5s 节流，见 §2.3）；
- `chat_completed` / `chat_cancelled` / `chat_failed` 统一补上 `source`、`turn_index` / `is_follow_up`、`provider_type`、`ttft_ms`；
- `chat_failed` 新增 `error_code` 归因（`classifyChatError()`，background 在 `ChatStreamFailedEvent.code` 里优先给出结构化归因）；
- `chat_stopped_by_user`（用户主动停止，与关闭面板导致的 abort 区分开）；
- `chat_panel_mode_toggled`（卡片态↔聊天态切换 + `streaming`）；
- `speech_started` / `speech_finished` / `speech_dismissed`（朗读触发 → 终局 → 退场，见 §2.8）。

### P3 — 配置细节、留存与合规（部分已实现 ✅ 2026-10-18）

已完成：
- `daily_active`（DAU / 留存，见 §2.1）；
- `telemetry_toggled`（遥测关闭率，见 §2.7，含上报与落盘的先后顺序处理）；
- `provider_switched` 的 Popup 分支（见 §2.6，属性增 `source: popup`）；
- `model_selected`（三条选择路径，见 §2.6）；
- 系统提示词自定义排查：**没有新建 `system_prompt_customized`**，而是给已有的 `system_prompt_save` 追加属性（`is_empty` / `is_default` / `length_bucket` / `used_placeholders`）——两者语义重叠，按 §7 第 1 条不允许造重复语义的事件。

剩余候选：

| 建议事件 | 触发位置 | 建议属性 | 价值 |
|----------|----------|----------|------|
| `model_params_changed` | `ModelParamsEditor.tsx`（保存时） | `param_keys: string[]`, `param_count` | 高级功能渗透率，决定参数 UI 是否值得保留 |
| `tts_settings_changed` | `ActionsSection.tsx` `updateTts` | `provider`, `voice_locale`, `rate`, `auto_locale` | 朗读设置偏好 |
| `tts_preview_played` | `ActionsSection.tsx` `handlePreview` | `provider`, `success` | 试听功能是否被使用（与 `edge_tts_synthesize` 的成功率互为补充） |
| `speech_control_used` | `useSpeechPlayer.ts` `togglePause` / `seekRatio` / `changeVoice` / `changeRate` | `action`(`pause`/`resume`/`seek`/`voice`/`rate`) | 朗读控件里真正的交互发生在哪（当前只知触发与终局） |
| `update_prompted` / `update_clicked` | 若将来做更新引导 | `from_version`, `to_version` | 版本升级引导效果 |

> 上限管理：PostHog 免费额度按事件量计。P3 剩余项结合额度分批上；**任何一条上线都要回到 §2 表格登记**。

---

## 6. PostHog Dashboard 与 Insight 清单

> 本节是「建图待办 + 已建图索引」。新建 / 修改 Insight 后回来更新状态与链接（见 §7 维护流程第 5 条）。

### 6.1 先明确三个口径前提

| 前提 | 影响 |
|------|------|
| `distinct_id` 是**每设备一份**的匿名 ID（`aiction:anonymousId`，存 `storage.local`） | 所有「用户数」实为**设备数**；重装 / 清扩展数据会算成新设备 |
| 没有 `$pageview`，SDK `persistence: "memory"` | PostHog 自带的会话 / 路径类分析基本不可用，全部指标走自定义事件 |
| `daily_active` 用**本地时区**日期去重，PostHog 按**项目时区**聚合 | 两者可能差一天（边缘时区）；看趋势足够，不要做逐日精确对账 |

通用拆分维度：`source`（web/pdf/popup/options）、`provider_type`、`is_custom`、`model`、`version`。

### 6.2 Dashboard A — 增长与激活

| # | Insight | 类型 | 配置 | 回答什么问题 |
|---|---------|------|------|--------------|
| A1 | 安装与升级趋势 | Trends（Line，按周） | `extension_installed`（Unique users）；叠加同图表 `extension_updated` | 装机量走势、升级节奏 |
| A2 | **核心激活漏斗** | Funnel（按设备，窗口 7 天） | `extension_installed` → `provider_configured` → `first_action_clicked` → `chat_completed` | 装完之后卡在哪一步（配 Key 是主要流失点） |
| A3 | 未配置就使用 | Trends（Bar，按天） | `action_triggered_without_provider`（Total events），拆分 `source` | 多少人装了就用、还没配好 —— A2 第 2 步流失的旁证 |
| A4 | 首次配置路径 | Trends（Bar，按周） | `provider_configured`（Unique users），拆分 `trigger`（`api_test` / `chat`） | 用户是靠「测试连接」还是「直接开聊」验证配置成功的 |
| A5 | 入口分布 | Trends（Bar，按周） | `popup_opened` / `options_opened`（拆分 `entry`）/ `pdf_viewer_opened`（拆分 `scheme`） | Popup、设置页、PDF 阅读器的相对使用量 |
| A6 | 提问入口可用率 | Trends（Bar，按周） | `popup_ask_clicked`（Total events），拆 `result`（`opened` / `unsupported`） | 点「在当前页面提问」后落到不可注入页面（`chrome://` / 商店页）的比例 —— 决定这条入口是否还需要更细的引导 |

### 6.3 Dashboard B — 使用与留存

| # | Insight | 类型 | 配置 | 回答什么问题 |
|---|---------|------|------|--------------|
| B1 | DAU | Trends（Line，按天） | `daily_active`（Unique users） | 日活走势 |
| B2 | 留存 | Retention（Weekly，起始 `daily_active` → 返回 `daily_active`） | — | 周留存曲线（**上线后至少等满 7 天再看**） |
| B3 | 使用频次分布 | Stickiness（按周，`daily_active`） | — | 轻 / 重用户比例（一周用 1 天与用 5 天的人数分布） |
| B4 | 划词→动作转化 | Trends（Line，双系列，按天） | 系列 1 `selection_toolbar_shown`（Unique users）；系列 2 `action_clicked`（Unique users）；可加 Formula `B / A` | **划词流失率**：划了词但没点动作的比例趋势 |
| B5 | 会话深度 | Trends（Bar） | `chat_completed`（Total events），拆 `turn_index` 或用属性过滤拆成 1 / 2 / 3+ 三个系列 | 追问入口有没有人用、能用多深 |
| B6 | 网页 vs PDF | Trends（Line，按周） | `action_clicked` / `chat_completed` 拆 `source` | PDF 场景值不值得继续投入 |

### 6.4 Dashboard C — 功能采用

| # | Insight | 类型 | 配置 | 回答什么问题 |
|---|---------|------|------|--------------|
| C1 | 动作使用排行 | Trends（Bar，横向） | `action_clicked`（Total events），拆 `action_id` | 内置动作与各个自定义动作的热度 |
| C2 | 自定义动作渗透 | Trends（Line，双系列） | `action_clicked` 拆 `is_custom`（true / false） | 多少人用到了自定义动作 |
| C3 | 自定义动作增删 | Trends（Line，按周） | `action_created`（Unique users）/ `action_deleted`（Total events） | 创建后会不会删（建了不用 = 模板难写） |
| C4 | 自定义动作长什么样 | Trends（Bar） | `action_updated` 拆 `changed_fields`；叠加 `has_selection_placeholder` | 用户改文案还是改模板、模板有没有带 `{selection}` |
| C5 | 模型排行 | Trends（Bar，横向） | `model_selected`（Total events），拆 `model`（可再拆 `provider_type`） | 最常用模型（定默认值与适配优先级） |
| C6 | Provider 类型分布 | Trends（Pie） | `provider_configured`（Unique users），拆 `provider_type` | models.dev 预设 vs 自定义兼容端点的比例 |
| C7 | 快捷动作 | Trends（Bar） | `quick_action_clicked` 拆 `action_type`（`copyToClipboard` / `speakText`） | 复制与朗读各占多少 |
| C8 | 自由输入 vs 动作 | Trends（Line，按周） | `free_input_submitted` vs `action_clicked` | 用户更依赖预设动作还是自己提问 |
| C9 | 面板形态切换 | Trends（Pie） | `chat_panel_mode_toggled` 拆 `to_mode`；过滤 `streaming = true` 可单独看「生成中就展开追问」 | 卡片态够不够用 |
| C10 | 朗读采用与完成率 | Trends（Line）+ Formula | 系列 1 `speech_started`；系列 2 `speech_finished` 过滤 `interrupted = false`；Formula `B / A` | 朗读有多少人用、用了能不能听完 |
| C11 | 朗读引擎（降级率） | Trends（Pie） | `speech_finished` 拆 `provider`（`edge` / `system`） | 在线合成失败的降级占比 |

### 6.5 Dashboard D — 质量与性能

| # | Insight | 类型 | 配置 | 回答什么问题 |
|---|---------|------|------|--------------|
| D1 | **对话成功率** | Trends（Line）+ Formula | 系列 A `chat_completed`、B `chat_failed`、C `chat_cancelled`；Formula `A / (A + B + C)` | 端到端可用性走势 |
| D2 | **失败归因** | Trends（Pie） | `chat_failed`（Total events），拆 `error_code` | 失败是 Key、限流、超时还是端点问题 |
| D3 | 失败率按 provider | Trends（Line） | `chat_failed` 拆 `provider_type`（可再拆 `model`） | 自定义端点是不是主要失败源 |
| D4 | TTFT 分位 | Trends（Line，P95 of property `ttft_ms`） | 事件 `chat_completed`，拆 `provider_type` / `model` | 首字延迟（比总时长更接近体感） |
| D5 | 总时延分位 | 同上，property `duration_ms` | 事件 `chat_completed`；另可建 `chat_failed` 的 P95 | 慢在哪一段 |
| D6 | 用户主动停止率 | Trends（Line）+ Formula | `chat_stopped_by_user` / `chat_completed` | 生成质量 / 长度的代理指标 |
| D7 | API 测试 | Trends（Line） | `api_test_completed` 拆 `success`；`latency_ms` 取 P95 | 配置阶段就暴露的连通性问题 |
| D8 | Edge TTS 合成 | Trends（Line） | `edge_tts_synthesize` 拆 `success` | 在线语音的可用性（与 C11 互为交叉验证） |
| D9 | 遥测关闭率 | Trends（Line，按周） | `telemetry_toggled` 拆 `enabled`（`false` 占比 = 关闭率） | 隐私信任指标 |

### 6.6 建图注意事项

- **事件名与本文档 §2 严格一致**，不要在 PostHog 里异名重命名，否则后续对不上口径。
- 分桶属性（`*_length_bucket`）是字符串，PostHog 里默认按字典序排序（`1-20` < `200+` < `21-60`），做直方图时手动定序；若要做数值分布，另建带数值属性的新事件（不往已有属性里塞数值——会破坏已有图表）。
- 带 `?` 的属性（`ttft_ms` 在未收到内容时不上报、`model` 在手输路径不上报）会让分位计算的分母偏小，看趋势可以，别当绝对值。
- 排序优先级：**A2 / A3（激活）与 D1 / D2（质量）先建**，这两组直接指导产品决策；其余按需。
- 每个 Dashboard 写一句描述（数据来源 + 关键口径 + 指向本文档），避免半年后没人知道怎么读。

### 6.7 登记表（建完回填）

| 状态 | Dashboard | PostHog 链接 | 备注 |
|------|-----------|--------------|------|
| ⬜ | A 增长与激活 | | 含核心漏斗 A2、未配置流失 A3 |
| ⬜ | B 使用与留存 | | 含 DAU B1 与留存 B2（等满 7 天） |
| ⬜ | C 功能采用 | | 含模型排行 C5、自定义动作 C1–C4 |
| ⬜ | D 质量与性能 | | 含成功率 D1 与失败归因 D2 |

---

## 7. 维护流程（改埋点的人请照做）

新增 / 修改埋点时：

1. 先在本文件 §5 找到对应条目（或新增一行），确定**事件名、属性、触发点**是否已存在同名/近义事件（禁止造重复语义的事件）。
2. 在代码里按 §3 规范实现；一次上报尽量把同一分析主题的属性带齐，避免以后加属性导致新旧数据口径断裂。
3. 跑 `npm run typecheck` 与 `npm run build`（项目规则要求）。
4. 更新本文件：
   - §2 表格增删改对应行（含「用途」列），并更新页首「当前事件数」；
   - 若属新增能力，从 §5 移到 §2（P0 / P1 就是按这个流程落地的）；
   - §8 变更记录追加一行（日期 / 事件 / 说明）。
5. 在 PostHog 建同名 Insight，并回到 §6 登记表回填链接与状态。
6. 若涉及新的数据类型或口径变化，**同步检查**：
   - `src/shared/i18n/locales/*.ts` 的 `options.about.telemetryDesc` 文案；
   - `docs/PRIVACY_POLICY.md` 的 Analytics 章节（承诺范围必须与实际上报一致）。

## 8. 变更记录

| 日期 | 变更 | 说明 |
|------|------|------|
| 2026-10-18 | 建档 | 首次梳理，18 个事件入库；记录 `custom_action_labels` 隐私偏差、`source` 缺失、无 dev 环境隔离等问题，输出 P0–P3 建议 |
| 2026-10-18 | P0 落地（+6 → 24 个事件） | 新增 `first_action_clicked`、`provider_configured`、`action_triggered_without_provider`、`popup_opened`、`options_opened`、`pdf_viewer_opened`；`action_clicked` / `quick_action_clicked` / `free_input_submitted` 补 `source`；新增 `AnalyticsSource` 类型、`consumeFirstTimeFlag` / `trackFirstTimeEvent` 工具与 `OPTIONS_ENTRY_STORAGE_KEY` 常量 |
| 2026-10-18 | P1 落地 + 隐私改造（+6 → 30 个事件） | 新增 `action_created`、`action_updated`、`action_deleted`、`action_reordered`、`action_enabled_toggled`、`action_icon_changed`；**移除** `action_clicked.action_label` / `action_clicked.custom_action_labels`、`provider_switched.from_provider` / `to_provider`、`provider_created.provider_name`（改为 `is_custom` / `provider_type` / `models_dev_id`）；`is_custom` 判定统一到 `isBuiltinActionId()`；`ActionsSection` 新增编辑聚合上报（`changed_fields` / 长度分桶） |
| 2026-10-18 | P2 落地（+1 → 31 个事件） | 新增 `selection_toolbar_shown`（5s 节流）；chat 三个事件统一补 `source` / `turn_index` / `is_follow_up` / `provider_type` / `ttft_ms`，`chat_failed` 补 `error_code`（新增 `ChatErrorCode` 与 `classifyChatError()`，`ChatStreamFailedEvent` 新增可选 `code`，background 侧给出结构化归因）；`ChatSession` 新增 `source` prop、`useToolbarState(source)`；`lengthBucket()` 上移到 `src/shared/analytics.ts` 共用 |
| 2026-10-18 | P2 收尾（+2 → 33 个事件） | 新增 `chat_stopped_by_user`（`useChatState` 新增 `activeRequestRef` 快照，只在用户点停止时上报，关闭面板的 abort 不上报）与 `chat_panel_mode_toggled`（`ChatPanel` 新增 `source` prop，属性 `to_mode` / `streaming`） |
| 2026-10-18 | P2 完成（+3 → 36 个事件） | 新增 `speech_started` / `speech_finished`（`reportSpeechEnd`，`interrupted` 区分自然播完与中途关闭）/ `speech_dismissed`（闲置退场，`elapsed_ms`）；`useSpeechPlayer` 新增 `source` 参数，`SpeechWidget` 新增 `source` prop；顺带修正 edge 合成失败降级后会话内 engine 未同步的问题 |
| 2026-10-18 | P3 部分落地（+2 → 38 个事件） | 新增 `daily_active`（SW 被唤醒当日一次，本地时区日期 + promise 双重去重）与 `telemetry_toggled`（含「关闭先上报、开启先落盘」的顺序处理）；`provider_switched` 新增 Popup 上报分支（`source: popup`）；provider 类型判定抽到 `src/shared/provider-type.ts`，`useChatState` / `useProviderManager` / `Popup` 三处共用 |
| 2026-10-18 | P3 续（+1 → 39 个事件） | 新增 `model_selected`（三条路径：models.dev 列表 / 接口拉取下拉 / 手输 blur，**手输不上报模型名**）；`system_prompt_save` 追加属性 `is_empty` / `is_default` / `length_bucket` / `used_placeholders`（不新建重复语义的 `system_prompt_customized`） |
| 2026-10-19 | Popup 重设计（+1 → 40 个事件） | 新增 `popup_ask_clicked`（`result`: `opened`/`unsupported`, `source: popup`），配套新功能「在当前页面提问」（`MESSAGE_TYPES.OPEN_CHAT` → content script 开一个空白聊天态面板并聚焦输入框，`messaging.ts` `requestOpenChatInActiveTab()`）；`popup_opened` / `provider_switched` / `action_enabled_toggled` 的事件与属性**零增删**；顺带修正 §2.6 里 `provider_switched` 的 Popup 分支函数名引用（`handleServiceChange` → `handleProviderChange`） |
| 2026-10-19 | 设置页 UI 重构（`docs/OPTIONS_UI.md`）后同步 | **事件与属性零增删**；仅更新触发位置引用：自定义动作相关事件从 `ActionsSection.tsx` 迁到 `CustomActionsCard.tsx`（`updateCustomAction` → `updateActionDraft`）；`action_updated` 的取值改为「草稿优先」的有效值（编辑不再逐字落盘），时机（2s 静默 / 保存 / 删除前 / 卸载）不变 |
| 2026-10-18 | 建图清单（新增 §6） | 补齐 PostHog Dashboard 清单：口径前提（设备级 distinct_id / 无 pageview / 本地 vs 项目时区）、四个 Dashboard（A 增长与激活含核心漏斗、B 使用与留存、C 功能采用、D 质量与性能）共 31 条 Insight、建图注意事项与登记表；原 §6/§7 顺延为 §7/§8 |
