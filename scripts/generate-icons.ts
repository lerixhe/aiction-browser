/**
 * 从原始 logo（logo_raw.jpg，1024×1024）生成扩展图标与商店图标。
 *
 * 产物：
 * - src/assets/icon.png            512×512 构建源（WXT @wxt-dev/auto-icons 会据此生成
 *                                  manifest 的 icons/16、32、48、128）
 * - store/icons/icon-{16,32,48,128}.png   Chrome Web Store 上架用图标（PNG，正方形）
 *
 * 用法：npm run icons
 *
 * 说明：
 * - 原始 logo 是**满版方形蓝底**（四角不透明），与旧版 icon.png 一致，因此不做圆角裁剪；
 *   Chrome 工具栏 / 商店列表会自行处理圆角与描边。
 * - 缩放统一用 lanczos3（sharp 默认），避免双线性在 16px 上产生糊边。
 * - PNG 用 64 色调色板 + 最高质量量化（图形只有蓝白两色，观感无损），
 *   512 图标从真彩 116 KB 降到 ~37 KB。
 */
import fs from "node:fs/promises"
import path from "node:path"

// sharp 是 @wxt-dev/auto-icons 的依赖；若当前包管理器未提升它到顶层，
// 直接 import 会解析失败，提示用户显式安装即可。
const sharp = await import("sharp")
  .then((mod) => mod.default)
  .catch(() => {
    console.error("[icons] 找不到 sharp，请先安装：pnpm add -D sharp")
    process.exit(1)
  })

const ROOT = path.resolve(import.meta.dirname, "..")
const SOURCE = path.join(ROOT, "logo_raw.jpg")
/** 构建源尺寸：够 128px 商店图标 4 倍余量，同时保持 BrandIcon 加载体积可控 */
const BASE_SIZE = 512
const STORE_SIZES = [16, 32, 48, 128] as const
const BASE_ICON_PATH = path.join(ROOT, "src/assets/icon.png")
const STORE_ICON_DIR = path.join(ROOT, "store/icons")

async function renderPng(size: number, outPath: string) {
  await sharp(SOURCE)
    .resize(size, size, { kernel: "lanczos3", fit: "cover" })
    .png({ compressionLevel: 9, palette: true, colors: 64, quality: 100 })
    .toFile(outPath)
  const { size: bytes } = await fs.stat(outPath)
  console.log(`[icons] ${path.relative(ROOT, outPath)}  ${size}×${size}  ${(bytes / 1024).toFixed(1)} KB`)
}

await fs.access(SOURCE).catch(() => {
  console.error(`[icons] 缺少原始 logo：${SOURCE}`)
  process.exit(1)
})

await fs.mkdir(path.dirname(BASE_ICON_PATH), { recursive: true })
await fs.mkdir(STORE_ICON_DIR, { recursive: true })

await renderPng(BASE_SIZE, BASE_ICON_PATH)
for (const size of STORE_SIZES) {
  await renderPng(size, path.join(STORE_ICON_DIR, `icon-${size}.png`))
}

console.log("[icons] 完成。构建源已更新，跑 npm run build 生成 manifest 图标。")
