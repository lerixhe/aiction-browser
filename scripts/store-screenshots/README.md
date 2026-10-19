# 商店截图生成

分两步：**拍原料** + **合成成品**。最终产物是 `store/screenshots/` 下 4 张 1280×800（24-bit PNG 无 alpha）
截图，每张是一个「虚拟浏览器窗口」嵌在品牌背景上的构图；原始满版截图存在 `store/screenshots/raw/`。

## ① 拍原料（shoot.mjs）

用 Playwright 起一条**真实的扩展**（加载 `.output/chrome-mv3`），打开本地演示站点，
用真实鼠标划词 → 点动作 → 等流式回答 → 展开追问，逐帧截图。AI 回复由本地 mock 端点
（`mock.mjs`，OpenAI 兼容 SSE）提供，因此**不消耗任何 API 额度、不上传任何数据**。

## 前置

```bash
npm run build                                # 产出 .output/chrome-mv3
npm i -D playwright && npx playwright install chromium
```

## 运行

```bash
node scripts/store-screenshots/shoot.mjs              # 4 张全出
STEPS=1,2 node scripts/store-screenshots/shoot.mjs    # 只出 1、2 张
```

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| `STEPS` | `1,2,3,4` | 要生成的步骤（见下表） |
| `PORT` | `4173` | 演示站点 + mock 端点端口 |
| `CHROME_PATH` | Playwright 自带 chromium | 指定其它 Chromium/Chrome for Testing（品牌版 Chrome 137+ 不再支持 `--load-extension`） |
| `EXT_DIR` | `.output/chrome-mv3` | 扩展构建目录 |
| `OUT_DIR` | `store/screenshots/raw` | 原始截图输出目录 |

## ② 合成成品（frame.mjs）

`frame.html` 是一张纯 HTML 的「画布」（1280×800）：品牌渐变背景 + 虚构的浏览器窗口
（红黄绿窗口按钮、前进/后退/刷新、圆角地址栏、已装扩展图标），中间按 0.85 等比缩放嵌入 raw 截图。
`frame.mjs` 用 headless Chrome 以 **2× 像素密度**截屏，再用 sharp 降到 1280×800
（超采样：边框、圆角、阴影和地址栏文字比 1× 直出干净），并强制 24-bit PNG。

```bash
node scripts/store-screenshots/frame.mjs              # 4 张全出
STEPS=3 node scripts/store-screenshots/frame.mjs      # 只重合成第 3 张
```

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| `STEPS` | `1,2,3,4` | 要合成的步骤 |
| `CHROME_PATH` | 自动探测（playwright 缓存 → 系统 Chrome） | headless Chrome 可执行文件 |
| `RAW_DIR` | `store/screenshots/raw` | 原始截图目录 |
| `OUT_DIR` | `store/screenshots` | 成品输出目录 |
| `SCALE` | `2` | 超采样倍数（仅影响合成过程，成品恒为 1280×800） |

改版后只需重跑 `①` + `②`；只调边框/背景/地址栏时不需重拍，`STEPS=… node .../frame.mjs` 即可。

背景与边框都在 `frame.html` 里，改文案（虚拟 URL）改该文件顶部的 `SHOTS` 表；
每张图的深浅主题也在那里指定（第 3 张是深色页面，用深色背景）。

## 四张截图

| 步骤 | 输出 | 场景 |
|------|------|------|
| 1 | `01-select-toolbar.png` | 浅色文章页划词，工具栏浮出 |
| 2 | `02-instant-answer.png` | 点 Explain 后的卡片态流式回答（不遮挡选区） |
| 3 | `03-follow-up-chat.png` | 深色主题，展开聊天态追问第二轮，面板拖到右侧与文章并排 |
| 4 | `04-custom-actions.png` | 设置页 AI Actions 区：自定义动作列表 + 模板编辑器 |

## 素材与注意事项

- `site/a.html`、`site/b.html` 是**自造的虚构文章页**（品牌、作者、正文均为虚构），
  截图里不出现第三方网站内容，避免版权与商标问题。
- 扩展设置由 `settings.mjs` 直接写入 `chrome.storage.sync`（4 个自定义动作、两个 provider、
  英文界面、深/浅主题按步骤切换）。
- 第 2/3 张会先点工具栏的 ×（关闭工具栏）再截图，否则工具栏会压在面板内容上。
- 面板位置是真实拖拽出来的（`clampPanelDragPos` 会限制拖出视口），改版后位置可能需要微调。
- 第 4 张的两个 provider 端点被改成真实地址（仅显示，不请求），否则会暴露 `127.0.0.1`。
- 若 UI 改版导致构图变化（面板尺寸 / 头部按钮文案 / 设置页分区），需要同步改 `shoot.mjs` 里的
  选择器与滚动偏移。选择器：`[data-aiction-toolbar]`、`[data-aiction-chat-panel]`、
  `button[aria-label="Explain"]`（动作名来自 `settings.mjs` 的 label）、`aria-label="Follow up"`、
  `aria-label="Close toolbar"`、`aria-label="Copy answer"`。
- `headless: false` 是刻意的：扩展在 headed 模式下最稳。CI 里跑需要 `xvfb-run`。
- 若本地 playwright 版本比已下载的浏览器新，`shoot.mjs` 会报 `Executable doesn't exist at .../chromium-1248/...`：
  要么 `npx playwright install chromium` 补下载，要么直接给 `CHROME_PATH` 指向已存在的
  `chromium-<旧版本>/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
  （实测可用，无需重装）。
- 合成时**不要给 headless Chrome 传 `--user-data-dir`**：macOS 上首次使用新 profile 会弹钥匙串
  授权对话框，进程挂死（`frame.mjs` 已改用 `--use-mock-keychain --password-store=basic`）。
- 虚拟浏览器窗口的构图参数在 `frame.html` 顶部 `:root`（`--win-w: 1088` = raw 宽度 1280 × 0.85，
  内容区 1088×680、标题栏 44），画布恒为 1280×800；改 `--win-w` 后内容高度会等比跟随，
  上下留白随之变化，成品仍是 1280×800。
