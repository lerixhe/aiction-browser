# AIction — Chrome Web Store 商品页文案

> 上架表单字段的定稿文案。**标题 / 短描述与 `public/_locales/{en,zh_CN}/messages.json` 的
> `extName` / `extDescription` 必须逐字符一致**（含 en dash `–` U+2013）。
>
> 硬约束：名称 ≤ 45 字符、短描述 ≤ 132 字符、详细描述 ≤ 16000 字符。
> 合规红线见文末。

## 1. 名称（item name）

| 语言 | 文案 | 字符 |
|------|------|------|
| English | `AIction – Select to Ask AI \| Custom Actions` | 43 |
| 中文 | `AIction – 划词 AI 助手 \| 自定义 AI Actions` | 35 |

取舍说明：`品牌 → 核心场景 → 差异化功能` 三段式；不写第三方厂商名（商标风险），
不堆多个 `|`（keyword stuffing 风险）。

## 2. 短描述（short description）

| 语言 | 文案 | 字符 |
|------|------|------|
| English | `Select text to explain, summarize, translate or chat with actions you define. Bring your own API key and model. Also reads PDFs.` | 128 |
| 中文 | `在任意网页划词，一键解释、总结、翻译或追问，动作与提示词完全自定义。无需注册，自带 API Key 直连你自己配置的 AI 服务，选文不经我们的服务器。含 PDF 阅读器。` | 86 |

> ⚠️ 2025-02 拒审（Yellow Argon / 关键字垃圾内容）后已移除短描述里的第三方厂商名。
> 旧版中文短描述列举了四家厂商名（如「直连 A/B/C/D」），**不要回退**，详见 §6。

## 3. 详细描述（detailed description）

Chrome Web Store 的详细描述是**纯文本渲染**，不支持 Markdown / HTML，仅保留换行。
因此用 `▸` 分节、`•` 列项，段间留空行。

### English

```
Select text on any page and a small toolbar appears. Pick an action, watch the answer stream in, then keep asking in a floating chat panel.

No account. No sign-up. No credits. AIction calls the AI service you already use — your key, your model, your bill.

▸ HOW IT WORKS
1. Select text on a page.
2. Click an action on the toolbar.
3. Read the streamed reply, then keep asking in the panel.

▸ ACTIONS YOU DEFINE
Most text-selection tools give you fixed buttons. In AIction every button is a prompt template: write {selection} wherever the selected text should go, then change the name, icon, template, order or visibility. "Explain this code", "Polish this email", "Pull out the key numbers" — whatever you need.
Two actions are built in: Explain, and Translate with automatic Chinese ↔ English direction.

▸ BRING YOUR OWN MODEL
AIction talks to a service you already have. Any endpoint that follows the OpenAI chat completions format works — a mainstream API provider, an aggregator, or a gateway you host yourself. Enter the base URL, key and model name once, then switch between saved providers from the toolbar popup without leaving the page.

▸ BUILT-IN PDF READER
Open a PDF with AIction and selection, actions and chat work inside the document too — no separate app needed.

▸ ALSO INCLUDED
• Visible reasoning output — the model's thinking process is shown whenever the endpoint streams it
• Read selected text aloud: Edge online voices or the system voice, adjustable speed, automatic language matching
• Draggable, pinnable chat panels — several can be open on the same page
• One-click copy of the selected text
• Light / dark / auto theme, English and Chinese interface
• Export and import your configuration as JSON
• Editable system prompt with {pageTitle}, {pageUrl} and {surround} context placeholders

▸ PRIVACY
Your selected text, page content and AI replies travel directly from your browser to the API endpoint you configure. They never reach our servers. There is no account system, and we never see your API key.
We collect only anonymous usage statistics (feature counts, response latency) to improve the extension. You can turn this off at Settings → About.

▸ OPEN SOURCE
AIction is released under GPL-3.0. Source code and issue tracker:
https://github.com/lerixhe/aiction-browser
Contact: support@aiction.app
```

### 中文

```
在任意网页选中一段文字，工具栏会立刻浮现。选一个动作，看 AI 流式作答，然后在浮动面板里继续追问。

不需要注册账号，不需要充值额度。AIction 直接调用你自己配置的 AI 服务 —— 你的 Key、你的模型、你的账单。

▸ 怎么用
1. 在网页上选中文字。
2. 点击工具栏里的动作。
3. 流式回答随即出现，想追问就在面板里继续。

▸ 动作由你定义
大多数划词工具只给你固定的「翻译 / 总结」按钮。AIction 把每个按钮都做成提示词模板：用 {selection} 代表选中的文字，名称、图标、模板、排序、启停全部可改。比如「解释这段代码」「润色这封邮件」「提取其中的关键数字」。
内置两个动作：解释，以及中英互译（按原文主体语言自动判定方向）。

▸ 用你自己的模型
AIction 调用的是你自己已有的 AI 服务。任何遵循 OpenAI chat completions 格式的端点都能用 —— 你订阅的服务商、聚合 API，或自建网关。填入地址、密钥与模型名即可，之后在工具栏弹窗里随时切换，不必离开当前页面。

▸ 内置 PDF 阅读器
用 AIction 打开 PDF，文档里的选中、动作与对话照样可用，不需要额外装软件。

▸ 你可能在意的其他细节
• 支持思维链展示：端点返回推理内容时，可直接看到模型的思考过程
• 选中文字一键朗读：Edge 在线语音或系统语音，语速可调，自动匹配语言
• 对话面板可拖拽、可钉住，同一页面上可以同时开多个
• 一键复制选中文字
• 浅色 / 深色 / 跟随系统，界面支持中文与英文
• 配置可导出为 JSON 备份，也能导入恢复
• 系统提示词可自定义，支持 {pageTitle}、{pageUrl}、{surround} 等页面上下文占位符

▸ 隐私
你的选中文字、页面内容与 AI 回复，直接从你的浏览器发往你自己配置的 API 端点，不经过我们的服务器。没有账号体系，我们也永远拿不到你的 API Key。
我们只收集匿名的使用统计（功能使用次数、响应耗时）来改进产品，可在「设置 → 关于」里随时关闭。

▸ 开源
AIction 采用 GPL-3.0 开源协议，源码与问题反馈：
https://github.com/lerixhe/aiction-browser
联系邮箱：support@aiction.app
```

## 4. 合规红线（写文案时不要越过）

依据 `docs/PRIVACY_POLICY.md` 与 `docs/ANALYTICS.md` 核对：

| 可以写 | 不能写 |
|--------|--------|
| 「选文不经过我们的服务器」「直连你自己配置的端点」 | 「不收集任何数据」「零遥测」「完全离线」「本地运行」 |
| 「无需注册账号」（无账号体系） | 「输入永不离开浏览器」（有发往用户自己端点的请求，表述易被误解） |
| 用协议级表述说明兼容性：「任意 OpenAI chat completions 格式的端点」「你订阅的服务商 / 聚合 API / 自建网关」（协议名与技术格式不属于商标堆砌） | **名称 / 短描述 / 详细描述里罗列第三方厂商名**（OpenAI、Claude、Gemini、DeepSeek、OpenRouter …）——Google 直接判 keyword stuffing，见 §6 |
| 「同一页面可同时开多个面板」等可验证的功能陈述 | 排名 / 绝对化宣称（"best"、"No.1"、"最强大的"）、"绕过付费墙"类表述 |

补充：
- 遥测默认开启，任何隐私表述都必须保留「可关闭」的口径，与 PRIVACY_POLICY 的 PostHog 章节一致。
- 若今后新增 / 删除功能，先改本文件，再同步 `messages.json`，最后核对 `OPTIONS_UI` 的 About 文案。

## 5. 仍缺的上架素材

| 素材 | 规格 | 状态 |
|------|------|------|
| 商店图标 | 128×128 PNG | ✅ `store/icons/icon-128.png` |
| 截图 | 1280×800 或 640×400，至少 1 张 | ✅ `store/screenshots/01…04-*.png`（4 张，1280×800，24-bit PNG 无 alpha；虚拟浏览器窗口 + 品牌背景） |
| 小宣传图 | 440×280 | ✅ `store/promo/small-440x280.png` |
| Marquee 宣传图 | 1400×560 | ✅ `store/promo/marquee-1400x560.png` |
| 分类 | Productivity / Tools | 待定 |
| 语言 | English、中文（简体） | 待填 |

## 6. 拒审记录（提交前逐条核对）

### 2025-02｜Yellow Argon｜关键字垃圾内容（keyword stuffing）

- **判定原文**：`English: OpenAI, Anthropic Claude, Google Gemini, DeepSeek, OpenRouter, or your own gateway.`
- **命中文案**：详细描述英文版「▸ BRING YOUR OWN MODEL」段——把五家厂商名当作一串兼容性清单罗列。
- **同一病根的其余位置**（本次一并清掉，否则重提很可能再被打回）：
  - 详细描述中文版「▸ 用你自己的模型」段（同样罗列五家）
  - 详细描述「▸ ALSO INCLUDED / 你可能在意的其他细节」里点名的 `DeepSeek reasoning_content`
  - **中文短描述**（`直连 OpenAI/Claude/Gemini/DeepSeek`）→ 已改为「直连你自己配置的 AI 服务」，
    同时同步 `public/_locales/zh_CN/messages.json` 的 `extDescription`
- **纠正口径**：兼容性只写**协议/格式**层面的表述（OpenAI chat completions 格式、你订阅的服务商 / 聚合 API / 自建网关），
  不在任何商店字段里点名第三方厂商。
- **不受本政策管、可保留厂商名的地方**：`README.md` / `README.zh-CN.md`（GitHub，非商店元数据）、
  扩展 UI 内的 provider 列表（用户可见的功能界面，不是元数据）。**但不要把 README 的兼容性段落直接复制回商店文案。**
- **复审前自检**：§1–§3（真正粘贴进商店表单的部分）不得出现厂商名——
  人工核对，或用 `sed -n '1,/## 4\./p' store/listing.md | rg -n "Claude|Gemini|OpenRouter|Anthropic|DeepSeek"`
  （§4/§6 的说明文字本身含厂商名，不算提交内容）；
  `OpenAI` 只允许以「OpenAI chat completions 格式」这种协议表述出现。
