# store/

Chrome Web Store 上架素材。图标由 `npm run icons`（`scripts/generate-icons.ts`）从仓库根的
`logo_raw.jpg` 生成，**不要手改**。

| 文件 | 规格 | 用途 |
|------|------|------|
| `icons/icon-128.png` | 128×128 PNG | 商店列表图标（必需） |
| `icons/icon-48.png` / `icon-32.png` / `icon-16.png` | 对应尺寸 PNG | 与 manifest 图标同源，便于核对/替换 |
| `screenshots/01…04-*.png` | 1280×800 PNG（24-bit，无 alpha） | 商店商品页截图（成品：虚拟浏览器窗口 + 品牌背景），共 4 张 |
| `screenshots/raw/01…04-*.png` | 1280×800 PNG | 上一步的原始截图（页面内容满版、无边框），**不直接上传** |

四角不透明（满版方形蓝底）：商店列表与浏览器会自行套圆角，无需自己做圆角或透明角。

扩展内实际生效的图标来自 `src/assets/icon.png`（512×512），构建时由
`@wxt-dev/auto-icons` 生成到 `.output/chrome-mv3/icons/`。

文案定稿见 [`listing.md`](./listing.md)：名称、短描述、中英详细描述、合规红线。
名称 / 短描述须与 `public/_locales/{en,zh_CN}/messages.json` 逐字符一致。

截图由 `scripts/store-screenshots/` 从真实构建产物自动拍摄（Playwright 加载扩展 + 本地演示站点
+ 本地 mock 端点），再合成带浏览器窗口边框的成品，**不要手工 PS**；改版后重跑：

```bash
npm run build
node scripts/store-screenshots/shoot.mjs   # ① 原始截图 → screenshots/raw/（前置见 scripts/store-screenshots/README.md）
node scripts/store-screenshots/frame.mjs   # ② 合成带框成品 → screenshots/（headless Chrome 渲染 frame.html）
```

合成用的浏览器头是**虚构的**（红黄绿窗口按钮 + 地址/扩展栏，URL 为演示站点或 `chrome-extension://`），
不模仿真实 Chrome 界面，也不出现任何第三方品牌。

| 截图 | 内容 |
|------|------|
| `01-select-toolbar.png` | 划词后工具栏浮出（浅色） |
| `02-instant-answer.png` | 卡片态流式回答（浅色） |
| `03-follow-up-chat.png` | 深色主题下的聊天追问（面板与文章并排，深色背景） |
| `04-custom-actions.png` | 设置页自定义动作（列表 + 提示词模板） |

仓库根的 `README.md` / `README.zh-CN.md` 直接引用这四个成品图（`store/screenshots/*.png`），
不再单独维护一套 README 图片；重拍后 README 自动同步。

待补素材：无。

## 宣传图（`promo/`）

| 文件 | 用途 |
|------|------|
| `small-440x280.png` | 商店小宣传图（必需尺寸） |
| `small-920x560.png` | 同图 2× 版本（备用 / 高清显示） |
| `marquee-1400x560.png` | 商店龙头（Marquee）宣传图 |

## 提交前必读

- 名称 / 短描述 / 详细描述的定稿与检查清单：`listing.md`。
- **不要在商店任何字段（含短描述）里罗列第三方 AI 厂商名**：会判 keyword stuffing 而拒审
  （2025-02 已因此被打回一次，细节与纠正口径见 `listing.md` §6）。兼容性只写「OpenAI chat
  completions 格式的端点」这类协议层表述。
