// Chrome Web Store 宣传图（小宣传图 440×280 / Marquee 1400×560）
//
//   npm i -D playwright && npx playwright install chromium
//   node scripts/store-screenshots/promo.mjs
//
// 纯 HTML/CSS 排版 + Playwright 按精确像素截图，不依赖设计软件。
// 素材：src/assets/icon.png（logo）、store/screenshots/02-instant-answer.png（产品截图）
// 输出：store/promo/*.png（不透明背景，无 alpha）
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "../..")
const OUT = process.env.OUT_DIR ?? path.join(root, "store/promo")

const TARGETS = [
  // 小宣传图：商店接受 440×280 或 920×560（两档比例并不相同，靠 ?zoom 缩放内容，上传二选一）
  { file: "small-440x280.png", html: "promo/small.html", width: 440, height: 280 },
  { file: "small-920x560.png", html: "promo/small.html", width: 920, height: 560 },
  // Marquee：商店只接受 1400×560
  { file: "marquee-1400x560.png", html: "promo/marquee.html", width: 1400, height: 560 }
]

fs.mkdirSync(OUT, { recursive: true })

// CHROME_PATH 可指定本地 Chromium（Playwright 版本与已下载浏览器不匹配时的逃生口）
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
)
for (const t of TARGETS) {
  const page = await browser.newPage({
    viewport: { width: t.width, height: t.height },
    deviceScaleFactor: 1,
    locale: "en-US"
  })
  await page.goto(`file://${path.join(here, t.html)}`)
  await page.waitForLoadState("networkidle") // 等本地图片解码完
  await page.waitForTimeout(250)
  const out = path.join(OUT, t.file)
  await page.screenshot({ path: out }) // 背景不透明 → 输出 RGB PNG
  const bytes = fs.statSync(out).size
  console.log(`saved ${path.relative(root, out)}  ${t.width}×${t.height}  ${(bytes / 1024).toFixed(0)}KB`)
  await page.close()
}
await browser.close()
