# 素材与设计工具总览（TOOLING）

本文件登记仓库里**除业务代码之外的全部工具**：生成上架素材的脚本、设计预览沙盒、设计存档、
文案定稿。目的是让 agent（和未来的自己）**在动手写新脚本之前先知道这些已经存在**。

> 前置阅读：上架素材的对外说明在 [`../store/README.md`](../store/README.md)，
> 截图流水线的操作细节在 [`../scripts/store-screenshots/README.md`](../scripts/store-screenshots/README.md)，
> 文案与拒审记录在 [`../store/listing.md`](../store/listing.md)。本文件是**索引 + 坑位清单**，
> 不重复上述细节。

## 0. 一句话地图

```
logo_raw.jpg ──[ generate-icons.ts ]──> src/assets/icon.png + store/icons/*
                  @iconify/json ──[ bundle-icons.ts ]──> src/shared/ui/bundled-icons.ts
                                              └──[ check-icons.ts ]──> 在线校验报告

真实扩展 + 演示站 + mock ──[ shoot.mjs ]──> store/screenshots/raw/*
        raw/* ──[ frame.html + frame.mjs ]──> store/screenshots/*   (1280×800 成品)
   promo/*.html ──[ promo.mjs ]──> store/promo/*                   (440×280 / 920×560 / 1400×560)
```

## 1. 工具矩阵

| # | 工具 | 入口 | 输入 → 产物 | 关键依赖 | 状态 |
|---|------|------|-------------|----------|------|
| 1 | 品牌图标生成 | `npm run icons`（`scripts/generate-icons.ts`） | `logo_raw.jpg`(1024²) → `src/assets/icon.png`(512²) + `store/icons/icon-{16,32,48,128}.png` | `sharp`（**仅作为 `@wxt-dev/auto-icons` 的传递依赖存在**） | 可用 |
| 2 | 图标库打包 | `npm run bundle-icons`（`scripts/bundle-icons.ts`，且是 `npm run build` 的前置步骤） | `node_modules/@iconify/json/json/tabler.json` → `src/shared/ui/bundled-icons.ts` | 硬编码的 106 项清单 | 可用 |
| 3 | 图标库在线校验 | `npx tsx scripts/check-icons.ts`（**无 npm 入口**） | `ACTION_ICON_LIBRARY` → HEAD 请求 `api.iconify.design` → 控制台报告 | 网络 | 可用 |
| 4 | 原始截图拍摄 | `npm run screenshots`（`scripts/store-screenshots/shoot.mjs`） | 真实扩展（`.output/chrome-mv3`）+ 演示站 + mock 端点 → `store/screenshots/raw/*.png` | `playwright`（headed 模式） | 可用，环境脆弱（见 §3.1） |
| 5 | 截图合成 | `npm run screenshots:frame`（`scripts/store-screenshots/frame.mjs`） | `raw/*.png` → `store/screenshots/*.png`（1280×800，24-bit 无 alpha） | headless Chrome + `sharp` | 可用 |
| 6 | 宣传图生成 | `node scripts/store-screenshots/promo.mjs`（**无 npm 入口**） | `promo/{small,marquee}.html` → `store/promo/{small-440x280,small-920x560,marquee-1400x560}.png` | `playwright` | 可用 |
| 7 | 商店文案定稿 | `store/listing.md`（非代码） | 名称 / 短描述 / 详细描述 + 合规红线 + 拒审记录 | — | 定稿，须与 locale 文件逐字符一致 |
| 8 | 宣传图设计简报 | `docs/gemini-promo-brief.md`（非代码） | 配色表 + 4 张宣传图标语清单（第 6 项 promo 工具的实际来源） | — | 历史输入 |

其余易被误当成「工具」的东西：`docs/images/options-ui/*.jpg` 是**手工截的**设置页改造前后对比图，
没有生成脚本。旧的 README 配图（工具栏 / 对话窗 / 设置页截图与 7MB 演示 gif）已删除，
README 现在直接引用 `store/screenshots/` 的成品图，不再手录。

## 2. 各工具详解

### 2.1 `scripts/generate-icons.ts`（品牌图标）

```bash
npm run icons      # 无参数、无环境变量
```

- 源图固定为仓库根的 `logo_raw.jpg`；缩放一律 `sharp` 的 `lanczos3`。
- 满版方形蓝底（四角不透明）→ **不做圆角 / 透明角裁剪**，Chrome 工具栏与商店列表自己套圆角。
- 输出 PNG 用 64 色调色板（`palette: true, colors: 64`），图形只有蓝白两色，观感无损，
  512 图标从真彩 116 KB 降到 ~37 KB（`BrandIcon` 在 popup / 设置页每帧都加载它）。
- 产物分两路：`src/assets/icon.png` 是**构建源**（WXT auto-icons 据此生成 manifest 的
  `icons/16,32,48,128`），`store/icons/*` 是**上架用**，两者同源但互不覆盖。
- 改 logo 后必须再跑 `npm run build`，否则 `.output/` 里的图标还是旧的。

### 2.2 `scripts/bundle-icons.ts`（图标库打包）

```bash
npm run bundle-icons     # 手动；npm run build 会自动先跑一次
```

- 把 `@iconify/json` 里用到的 Tabler 图标抽成 `IconifyJSON`（`prefix: "tabler"`，`width/height: 24`），
  产物 `src/shared/ui/bundled-icons.ts` 是**自动生成、不要手改**（文件头已注明）。
- 清单在脚本内硬编码：104 个 `DEFAULT_ICONS`（对应 `ACTION_ICON_LIBRARY`）+ 2 个 `NAV_ICONS`
  （`tabler:api`、`tabler:database-export`）= 106 个，约 22 KB 原始 / 8 KB gzip。
- 运行时 `src/shared/ui/iconify.tsx` 在模块加载时 `addCollection()` 注册这批图标，**离线可用**；
  用户另选的图标另存 `chrome.storage.sync` 的 `aiction:icons`（上限 50 个）。
- **一致性现状**（2026-06 核对）：`icon-library.ts` 的 104 项与 `DEFAULT_ICONS` 完全一致，无遗漏。
  但这是**人工维护的巧合**，没有自动断言——给 `ACTION_ICON_LIBRARY` 加图标却忘了同步
  `DEFAULT_ICONS` 时不会报错，运行时 Iconify 会回退到网络请求，离线就变空白。

### 2.3 `scripts/check-icons.ts`（图标库在线校验）

```bash
npx tsx scripts/check-icons.ts
```

- 对 `ACTION_ICON_LIBRARY` 逐项 `HEAD https://api.iconify.design/{prefix}/{name}.svg`，
  并发 10 一批，最后打印有效 / 无效数量和无效清单。
- **唯一有网络副作用**的工具（不发数据，只查存在性）；离线环境跑出来全是 invalid，不代表图标坏了。
- 没有 npm 入口，也没被 CI 引用，属于「加图标前后手动跑一次」的体检工具。

### 2.4 `scripts/store-screenshots/`（商店截图流水线）

三件套：**拍原料（①）→ 合成成品（②）→ 宣传图（③）**。① 与 ② 解耦是有意的：
只调边框 / 背景 / 地址栏时不需要重拍，`STEPS=3 npm run screenshots:frame` 即可。

| 文件 | 角色 |
|------|------|
| `mock.mjs` | 单进程两用：静态站点服务器 + OpenAI 兼容 SSE 端点（`/v1/chat/completions`、`/v1/models`）。回答是 4 段固定文案（`EXPLAIN_ANSWER` / `TECH_ANSWER` / `BLOCKING_FOLLOWUP` / `FOLLOWUP_ANSWER`），按最后一条 user 消息的关键词路由。**不消耗任何 API 额度、不上传任何数据**。`MOCK_LOG=1` 可打印请求。 |
| `settings.mjs` | 直接写 `chrome.storage.sync` 的固定设置：2 个 provider（端点指向 `127.0.0.1:PORT`）、4 个自定义动作（Explain / Translate / Summarize / Polish）、英文界面、`theme: "light"`。动作 label 被 `shoot.mjs` 的选择器依赖。 |
| `site/a.html`、`site/b.html` | 自造的虚构文章页（品牌、作者、正文全虚构，不使用第三方站点内容），`a` 是浅色复习方法文，`b` 是深色 Node 运行时文。 |
| `shoot.mjs` | `chromium.launchPersistentContext` 加载 `.output/chrome-mv3`，`headless: false`（扩展在 headed 下最稳）。真实鼠标划词 → 点动作 → 等流式回答 → 展开追问 → 真实拖拽面板 → 截图；截图前把鼠标移到 `(1272, 796)` 避免 hover 态；输出再用 `sharp` 兜底去掉 alpha（商店要求 24-bit）。 |
| `frame.html` | 纯 HTML 画布（1280×800）：品牌渐变背景 + **虚构**浏览器窗口（红黄绿按钮、圆角地址栏、扩展图标）。顶部 `:root` 里 `--win-w: 1088`（= raw 1280 × 0.85）、内容区 1088×680、标题栏 44。虚拟域名在 `<script>` 的 `SHOTS` 表（`inneratlas.press`、`stacknote.dev` 为虚构品牌，第 4 张用 `chrome-extension://aiction/options.html#actions`）。 |
| `frame.mjs` | headless Chrome 以 `SCALE=2` 像素密度截 `frame.html?step=N`，再 `sharp` 的 `lanczos3` 降到 1280×800 并 `removeAlpha()`。自己实现了 Chrome 探测顺序：`CHROME_PATH` → `~/Library/Caches/ms-playwright/chromium-*` → 系统 Chrome / Chromium。 |
| `promo/{small,marquee}.html` + `promo.mjs` | 宣传图。`small.html` 用 `vh` 单位自适应，同一份 HTML 出 440×280 与 920×560 两档（**商店两档比例并不相同，上传二选一**）；`marquee.html` 固定 1400×560，左侧文案 + 右侧真实产品截图 1:1 不放大。Playwright 按精确像素截图，背景不透明 → 直接得到 RGB PNG。 |

环境变量（**三个脚本各解析一遍 `STEPS`，互不知道对方**）：

| 脚本 | 环境变量 |
|------|----------|
| `shoot.mjs` | `STEPS`(1,2,3,4) / `PORT`(4173) / `CHROME_PATH` / `EXT_DIR`(`.output/chrome-mv3`) / `OUT_DIR`(`store/screenshots/raw`) |
| `frame.mjs` | `STEPS`(1,2,3,4) / `CHROME_PATH` / `RAW_DIR`(`store/screenshots/raw`) / `OUT_DIR`(`store/screenshots`) / `SCALE`(2) |
| `promo.mjs` | `OUT_DIR`(`store/promo`) / `CHROME_PATH` |

四张截图的内容与取舍见 `scripts/store-screenshots/README.md` 的表格，此处不复述。

## 3. 已知问题（**均未修复**，动手前先看）

1. **Playwright 是挂在 `/tmp` 的符号链接**
   `scripts/store-screenshots/node_modules -> /tmp/pw/node_modules`（`playwright ^1.64.1`）。
   `playwright` 与 `sharp` **都不在根 `package.json` 的 `devDependencies`** 里（sharp 只是
   `@wxt-dev/auto-icons` 的传递依赖）。`/tmp` 被清空 → ①③ 直接跑不起来；
   重装 `sharp` 的版本漂移也可能让 ② 的调色板输出变化。
2. **两个工具没有 npm 入口**：`check-icons.ts`（§2.3）与 `promo.mjs`（`store/promo/` 的再生产）
   只能靠读文档发现。`package.json` 的 `scripts` 里只有 `icons` / `screenshots` / `screenshots:frame`。
3. **`frame.html` 的 `data-ready` 是死代码**
   HTML 里留了「供 frame.mjs 轮询：图片解码完成才算就绪」（`document.documentElement.dataset.ready`），
   但 `frame.mjs` 实际只用 `--virtual-time-budget=2500` 死等，从不轮询。机器慢或图片大时可能截到白图。
4. **`promo.mjs` 的注释与实现不符**：注释写「两档比例并不相同，靠 `?zoom` 缩放内容」，
   而 `small.html` 实际用 `vh` 自适应，**没有 `zoom` 参数**（URL 也没带 query）。
5. **参数散落三处、互不知情**：`STEPS` 两个脚本各解析一遍；虚拟域名 / 主题 / 扩展 URL 在
   `frame.html` 顶部的 `SHOTS` 表；第 3 张截图的面板拖拽坐标**写死在 `shoot.mjs`**（`627, 82`），
   UI 改版后需要人肉微调。改版重拍时三处都要对着看。
6. **`bundle-icons.ts` 的 106 项清单硬编码、无一致性断言**（细节见 §2.2）。

## 4. 什么情况下要跑哪个工具

| 改动 | 必须重跑 |
|------|----------|
| 换 `logo_raw.jpg` | `npm run icons` → `npm run build` |
| 给 `ACTION_ICON_LIBRARY` 加 / 删图标 | 同步 `scripts/bundle-icons.ts` 的清单 → `npm run bundle-icons`（`build` 会自动跑）→ 建议 `npx tsx scripts/check-icons.ts` |
| 改划词工具栏 / 对话窗 / 设置页 UI | `npm run build` → `npm run screenshots` → `npm run screenshots:frame`（选择器与拖拽坐标可能要改，见 `scripts/store-screenshots/README.md` 末节） |
| 只调截图边框 / 背景 / 虚拟地址栏 / 主题 | `npm run screenshots:frame`（不必重拍） |
| 换 README 里的截图 | 无需单独操作：`README.md` / `README.zh-CN.md` 直接引用 `store/screenshots/*.png`，重跑上面两步即同步更新；换张数 / 改名才要动 README |
| 改品牌名 / 短描述 / 标语 | `store/listing.md` 与 `public/_locales/{en,zh_CN}/messages.json` 必须**逐字符一致**（其余 8 种语言的 `public/_locales/<id>/messages.json` 是各自翻译，不参与这条约束；所有 `_locales` 的 extName / extDescription 长度上限由 `npm run check:i18n` 断言）；然后 `node scripts/store-screenshots/promo.mjs` 重出宣传图 |
| 改 promo 版式 / 标语 | `node scripts/store-screenshots/promo.mjs` |
| 加 / 换商店截图张数 | 同时改 `shoot.mjs` 的 `STEPS` 分支、`frame.mjs` 的 `SHOTS` 表、`frame.html` 的 `SHOTS` 表（虚拟域名 / 主题）、`store/README.md` 与 `scripts/store-screenshots/README.md` 的表格 |

## 5. 环境自检（没有 `doctor` 脚本，手动跑这段）

```bash
node -e 'require("sharp"); console.log("sharp ok")'          # ①⑤ 的图片处理
node -e 'require("playwright"); console.log("playwright ok")' # ④⑥ 的浏览器自动化；断链则需重装
ls .output/chrome-mv3/manifest.json                          # ④ 的前置：先 npm run build
```

`frame.mjs` 的 Chrome 探测顺序见 §2.4；`playwright` 版本比已下载浏览器新时，
会报 `Executable doesn't exist at .../chromium-1248/...`，用 `CHROME_PATH` 指到已有的
`chromium-<旧版本>/…/Google Chrome for Testing` 即可（实测可用，无需重装）。

## 6. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-06 | 首次梳理并落盘：登记 6 个脚本 + 4 项设计 / 文案资产，记录 8 个已知问题（**均未修复**，仅登记） |
| 2026-06 | 清理：删除 `design/smiley/`（2 个笑脸组件存档）与 `smiley-preview.html`（预览沙盒）——灵动岛方案移除后已成孤儿；删除已过期的 `CLAUDE.md`；清理仓库内散落的 `.DS_Store`（均未入库，`.gitignore` 已覆盖）。已知问题由 8 条降至 6 条 |
