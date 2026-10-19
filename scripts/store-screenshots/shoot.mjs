// Chrome Web Store 截图生成：真实扩展（.output/chrome-mv3）+ 本地演示站点 + 本地 mock 端点
//
//   npm run build                     # 先产出扩展
//   npm i -D playwright && npx playwright install chromium
//   node scripts/store-screenshots/shoot.mjs            # 拍原始截图（raw）
//   node scripts/store-screenshots/frame.mjs            # 合成带浏览器框的成品（store/screenshots/）
//
// 输出：store/screenshots/raw/*.png（1280×800，无 alpha）
// 环境变量：STEPS / PORT / CHROME_PATH / EXT_DIR / OUT_DIR
import { chromium } from "playwright"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { startServers } from "./mock.mjs"
import { SETTINGS } from "./settings.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "../..")
const SITE = path.join(here, "site")
const OUT = process.env.OUT_DIR ?? path.join(root, "store/screenshots/raw")
const EXT = process.env.EXT_DIR ?? path.join(root, ".output/chrome-mv3")
const PORT = Number(process.env.PORT ?? 4173)
const STEPS = (process.env.STEPS ?? "1,2,3,4").split(",").map((s) => s.trim())

if (!fs.existsSync(EXT)) {
  console.error(`找不到扩展构建产物：${EXT}\n先运行 npm run build`)
  process.exit(1)
}

fs.mkdirSync(OUT, { recursive: true })
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiction-shots-"))

const server = await startServers({ siteDir: SITE, port: PORT })

const ctx = await chromium.launchPersistentContext(profileDir, {
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  headless: false,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  locale: "en-US",
  colorScheme: "light",
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling"
  ]
})
ctx.setDefaultTimeout(25000)

let [sw] = ctx.serviceWorkers()
if (!sw) sw = await ctx.waitForEvent("serviceworker")
const extId = new URL(sw.url()).host

/** 写入扩展设置（等价于用户在设置页里配好服务商与动作） */
async function configure(patch = {}) {
  const opt = await ctx.newPage()
  await opt.goto(`chrome-extension://${extId}/options.html`)
  await opt.evaluate(async (s) => {
    await chrome.storage.sync.set({ "aiction:settings": s })
  }, { ...SETTINGS, ...patch })
  await opt.close()
}

/** 截图：先把鼠标移开避免 hover 态，再抓视口（1280×800） */
const shot = async (page, name) => {
  await page.bringToFront()
  await page.mouse.move(1272, 796)
  await page.waitForTimeout(450)
  const raw = path.join(OUT, name)
  await page.screenshot({ path: raw })
  // 商店要求 24-bit PNG（无 alpha）：Playwright 多数情况下已输出 RGB，这里再兜底规范化一次
  try {
    const { default: sharp } = await import("sharp")
    const meta = await sharp(raw).metadata()
    if (meta.channels === 4 || meta.hasAlpha) {
      const buf = await sharp(raw).removeAlpha().png({ compressionLevel: 9, palette: false }).toBuffer()
      fs.writeFileSync(raw, buf)
    }
  } catch {
    /* sharp 不可用时保留 Playwright 原始输出 */
  }
  console.log("saved", path.relative(root, raw))
}

async function dragSelect(page, selector) {
  const box = await page.locator(selector).boundingBox()
  await page.mouse.move(box.x + 3, box.y + 9)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.86, box.y + box.height - 12, { steps: 24 })
  await page.mouse.up()
  await page.waitForTimeout(700)
}

/** 等流式回答结束：每条完成的助手消息都带「复制」按钮 */
async function waitAnswer(page, minCopies = 1) {
  await page.waitForFunction(
    (n) => {
      const sr = document.querySelector("aiction-ui")?.shadowRoot
      return (sr?.querySelectorAll('[aria-label="Copy answer"]')?.length ?? 0) >= n
    },
    minCopies,
    { timeout: 25000 }
  )
  await page.waitForTimeout(800)
}

async function openArticle(page, file) {
  await page.goto(`http://127.0.0.1:${PORT}/${file}`)
  await page.waitForSelector("aiction-ui", { state: "attached" })
  await page.waitForTimeout(400)
}

const closeToolbar = async (page) => {
  const btn = page.locator('[data-aiction-toolbar] button[aria-label="Close toolbar"]')
  if (await btn.count()) {
    await btn.click()
    await page.waitForTimeout(350)
  }
}

// ---------- 1 / 2：浅色 · 划词工具栏 + 卡片回答 ----------
if (STEPS.includes("1") || STEPS.includes("2")) {
  await configure({ theme: "light" })
  const page = await ctx.newPage()
  await openArticle(page, "a.html")
  await dragSelect(page, "#target")
  await page.waitForSelector("[data-aiction-toolbar]", { state: "visible" })

  if (STEPS.includes("1")) await shot(page, "01-select-toolbar.png")

  if (STEPS.includes("2")) {
    await page.locator('[data-aiction-toolbar] button[aria-label="Explain"]').click()
    await page.waitForSelector("[data-aiction-chat-panel]")
    await waitAnswer(page, 1)
    await closeToolbar(page)
    await shot(page, "02-instant-answer.png")
  }
  await page.close()
}

// ---------- 3：深色 · 聊天面板追问 ----------
if (STEPS.includes("3")) {
  await configure({ theme: "dark" })
  const page = await ctx.newPage()
  await openArticle(page, "b.html")
  await dragSelect(page, "#target")
  await page.waitForSelector("[data-aiction-toolbar]", { state: "visible" })
  await page.locator('[data-aiction-toolbar] button[aria-label="Explain"]').click()
  await page.waitForSelector("[data-aiction-chat-panel]")
  await waitAnswer(page, 1)
  await closeToolbar(page)

  await page.locator('[aria-label="Follow up"]').click()
  await page.waitForTimeout(900)
  const input = page.locator("[data-aiction-chat-panel] textarea")
  await input.fill("How do I find the call that blocks it?")
  await page.waitForTimeout(200)
  await input.press("Enter")
  await waitAnswer(page, 2)

  // 拖到右侧，让文章与面板并排（真实用户行为，位置随截图保存）
  const box = await page.locator("[data-aiction-chat-panel]").boundingBox()
  await page.mouse.move(box.x + 64, box.y + 16)
  await page.mouse.down()
  await page.mouse.move(627 + 64, 82 + 16, { steps: 22 })
  await page.mouse.up()
  await page.waitForTimeout(600)
  await shot(page, "03-follow-up-chat.png")
  await page.close()
}

// ---------- 4：设置页 · 自定义动作 ----------
if (STEPS.includes("4")) {
  // 截图里展示真实端点（不用于发请求，mock 只服务前三步）
  const realProviders = SETTINGS.providers.map((p) => ({
    ...p,
    apiBaseUrl: p.name === "Anthropic" ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1"
  }))
  await configure({ theme: "light", providers: realProviders })

  const page = await ctx.newPage()
  const scrollTo = (label, offset) =>
    page.evaluate(
      ([text, off]) => {
        const el = [...document.querySelectorAll("*")].find(
          (n) => n.children.length === 0 && n.textContent.trim() === text
        )
        if (!el) return
        el.scrollIntoView({ block: "start" })
        let p = el.parentElement
        while (p) {
          if (p.scrollHeight > p.clientHeight + 20) {
            p.scrollTop -= off
            break
          }
          p = p.parentElement
        }
      },
      [label, offset]
    )

  await page.goto("about:blank")
  await page.goto(`chrome-extension://${extId}/options.html#actions`)
  await page.waitForTimeout(1400)
  await scrollTo("Custom Actions", -168)
  await page.waitForTimeout(500)
  await shot(page, "04-custom-actions.png")
  await page.close()
}

await ctx.close()
server.close()
fs.rmSync(profileDir, { recursive: true, force: true })
