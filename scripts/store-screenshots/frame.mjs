// 商店截图合成：把 store/screenshots/raw 下的原始截图装进虚拟浏览器窗口 + 品牌背景，
// 输出 1280×800（Chrome Web Store 规格）的最终截图。
//
//   node scripts/store-screenshots/shoot.mjs    # 1) 先拍原始截图（真实扩展）
//   node scripts/store-screenshots/frame.mjs    # 2) 再合成带框成品
//
// 原理：frame.html 是一张纯 HTML 的「画布」，用 headless Chrome 以 2× 像素密度截屏，
// 再用 sharp 降到 1280×800（超采样，边框/文字/阴影比 1× 直出更干净）。
//
// 环境变量：STEPS（默认 1,2,3,4）/ CHROME_PATH / RAW_DIR / OUT_DIR / SCALE（默认 2）
import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const run = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "../..")
const RAW = process.env.RAW_DIR ?? path.join(root, "store/screenshots/raw")
const OUT = process.env.OUT_DIR ?? path.join(root, "store/screenshots")
const SCALE = Number(process.env.SCALE ?? 2)
const STEPS = (process.env.STEPS ?? "1,2,3,4").split(",").map((s) => s.trim())

const WIDTH = 1280
const HEIGHT = 800

const SHOTS = {
  1: "01-select-toolbar.png",
  2: "02-instant-answer.png",
  3: "03-follow-up-chat.png",
  4: "04-custom-actions.png"
}

/** 找 headless Chrome：CHROME_PATH → 项目内 playwright 缓存 → 系统 Chrome */
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = []
  const pwCache = path.join(os.homedir(), "Library/Caches/ms-playwright")
  if (fs.existsSync(pwCache)) {
    for (const dir of fs.readdirSync(pwCache).filter((d) => d.startsWith("chromium-")).sort().reverse()) {
      candidates.push(
        path.join(pwCache, dir, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
        path.join(pwCache, dir, "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
        path.join(pwCache, dir, "chrome-linux/chrome")
      )
    }
  }
  candidates.push(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium"
  )
  const found = candidates.find((p) => fs.existsSync(p))
  if (!found) {
    throw new Error("找不到可用 Chrome，请用 CHROME_PATH 指定（npx playwright install chromium 亦可）")
  }
  return found
}

const chrome = findChrome()
const page = path.join(here, "frame.html")
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiction-frame-"))
fs.mkdirSync(OUT, { recursive: true })

const { default: sharp } = await import("sharp")

let failed = false
for (const step of STEPS) {
  const file = SHOTS[step]
  if (!file) {
    console.error(`未知步骤：${step}`)
    failed = true
    continue
  }
  const raw = path.join(RAW, file)
  if (!fs.existsSync(raw)) {
    console.error(`缺原始截图：${path.relative(root, raw)}（先跑 shoot.mjs）`)
    failed = true
    continue
  }

  const png = path.join(tmpDir, `step-${step}.png`)
  const url = `file://${page}?step=${step}`
  await run(chrome, [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-sandbox",
    "--allow-file-access-from-files",
    // 不要传 --user-data-dir：macOS 上首次使用新 profile 会弹钥匙串授权对话框，进程挂死
    "--use-mock-keychain",
    "--password-store=basic",
    `--force-device-scale-factor=${SCALE}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    "--virtual-time-budget=2500",
    `--screenshot=${png}`,
    url
  ])

  // 超采样降到 1280×800，并强制 24-bit PNG（无 alpha，商店要求）
  const out = path.join(OUT, file)
  await sharp(png)
    .resize(WIDTH, HEIGHT, { kernel: "lanczos3", fit: "fill" })
    .removeAlpha()
    .png({ compressionLevel: 9, palette: false })
    .toFile(out)

  const meta = await sharp(out).metadata()
  const kb = (fs.statSync(out).size / 1024).toFixed(0)
  console.log(
    `saved ${path.relative(root, out)}  ${meta.width}×${meta.height}  ${meta.channels}ch${meta.hasAlpha ? " alpha!" : ""}  ${kb}KB`
  )
  if (meta.width !== WIDTH || meta.height !== HEIGHT) failed = true
}

fs.rmSync(tmpDir, { recursive: true, force: true })
if (failed) process.exit(1)
