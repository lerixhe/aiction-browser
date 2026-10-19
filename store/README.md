# store/

Chrome Web Store 上架素材。图标由 `npm run icons`（`scripts/generate-icons.ts`）从仓库根的
`logo_raw.jpg` 生成，**不要手改**。

| 文件 | 规格 | 用途 |
|------|------|------|
| `icons/icon-128.png` | 128×128 PNG | 商店列表图标（必需） |
| `icons/icon-48.png` / `icon-32.png` / `icon-16.png` | 对应尺寸 PNG | 与 manifest 图标同源，便于核对/替换 |

四角不透明（满版方形蓝底）：商店列表与浏览器会自行套圆角，无需自己做圆角或透明角。

扩展内实际生效的图标来自 `src/assets/icon.png`（512×512），构建时由
`@wxt-dev/auto-icons` 生成到 `.output/chrome-mv3/icons/`。

待补素材（需产品真实截图，未生成）：截图 1280×800 或 640×400、小宣传图 440×280、
Marquee 1400×560。
