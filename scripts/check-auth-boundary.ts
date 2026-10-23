/**
 * 凭据边界检查：content script / pdf-viewer **不得**引入会碰到 token 的模块。
 *
 * 用法：npm run check:auth-boundary（挂 `build` 前置）
 *
 * 为什么需要它：`AGENTS.md` 不变量 1「AI 请求只在 background」在登录功能上线后多了一层含义——
 * token 也只能在 background。`storage.session` 对 access token 有 Chrome 层面的强制隔离，
 * 但「不把 refresh token 传进内容脚本」只能靠代码纪律，而纪律靠人眼是守不住的：
 * 一个 `import { getAccessToken }` 的自动补全就会把凭据链路带进任意网页的注入代码里。
 *
 * 规则采用**白名单**（新增 auth 模块默认禁止，要放进 content 必须显式改这里）：
 *   允许：@/shared/auth/types · facade · use-auth-snapshot · actions
 *   禁止：其余 auth 模块（session / request / storage / device / pkce / entitlements / config / errors）
 *         以及任何指向 @/shared/provider-credentials 的导入
 *
 * 白名单的四个成员都只读快照或只产出可序列化数据，不含 I/O、不含凭据：
 * - `types`：类型 + key 常量 + 快照解析（纯函数）
 * - `facade`：读快照 / 订阅快照
 * - `use-auth-snapshot`：上面那个的 React hook
 * - `actions`：CTA 数据 `{ label, url }`（面板失败态要用）
 */
import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()

/** 受约束的入口目录（相对仓库根） */
const GUARDED_DIRS = ["src/entrypoints/content", "src/entrypoints/pdf-viewer"]

/** 允许被内容脚本引入的 auth 子模块 */
const ALLOWED_AUTH_MODULES = new Set(["types", "facade", "use-auth-snapshot", "actions"])

/** 一律禁止（无论哪个入口） */
const FORBIDDEN_SPECIFIERS = new Set(["/shared/provider-credentials"])

/** 抓 `from "x"` / 副作用 `import "x"` / 动态 `import("x")` 三种形态 */
const IMPORT_PATTERN = /(?:from\s*|import\s*\(\s*|import\s+)["']([^"']+)["']/g

const AUTH_PREFIX = "/shared/auth"

let checkedFiles = 0
const violations: string[] = []

function listSourceFiles(dir: string): string[] {
  const absolute = path.resolve(ROOT, dir)
  if (!fs.existsSync(absolute)) return []

  const result: string[] = []
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        result.push(full)
      }
    }
  }
  walk(absolute)
  return result
}

/** 把 `~/shared/...` 归一化成 `@/shared/...`，再剥掉别名前缀 */
function normalize(specifier: string): string {
  if (specifier.startsWith("~/")) return `@${specifier.slice(1)}`
  return specifier
}

/**
 * 相对路径 → 仓库内路径（`/shared/auth/session`）。
 *
 * 不处理相对导入是个真漏洞：`import { getAccessToken } from "../../shared/auth/session"`
 * 同样是凭据进内容脚本，而它看起来完全不像禁区（没有 `@` 前缀，自动补全也不会拦住你）。
 * 返回 `null` 表示指向 `src/` 之外（或算不出来），不归本脚本管。
 */
function relativeToSrc(file: string, specifier: string): string | null {
  const absolute = path.resolve(path.dirname(file), specifier)
  const relative = path.relative(path.resolve(ROOT, "src"), absolute)
  if (!relative || relative.startsWith("..")) return null
  return `/${relative.split(path.sep).join("/")}`
}

function checkFile(file: string): void {
  const relative = path.relative(ROOT, file)
  const content = fs.readFileSync(file, "utf8")

  IMPORT_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = IMPORT_PATTERN.exec(content)) !== null) {
    const raw = match[1]
    const specifier = normalize(raw)
    // 别名（`@/` / `~/`）直接剥前缀；相对路径按文件位置换算成仓库内路径；其余（包名）不管
    const withoutAlias = specifier.startsWith("@")
      ? specifier.slice(1)
      : raw.startsWith(".")
        ? relativeToSrc(file, raw)
        : null
    if (!withoutAlias) continue

    const line = content.slice(0, match.index).split("\n").length

    const forbidden = [...FORBIDDEN_SPECIFIERS].find(
      (target) => withoutAlias === target || withoutAlias.startsWith(`${target}/`)
    )
    if (forbidden) {
      violations.push(`${relative}:${line}  禁止在内容脚本引入凭据模块 — ${raw}（见 AGENTS.md 不变量 1）`)
      continue
    }

    if (!withoutAlias.startsWith(AUTH_PREFIX)) continue

    const rest = withoutAlias.slice(AUTH_PREFIX.length)
    // 裸 `@/shared/auth` 或 `@/shared/auth/` 一律拒（将来若加 barrel，会把全部导出带进来）
    if (rest === "" || rest === "/") {
      violations.push(`${relative}:${line}  禁止整体引入 @/shared/auth（会带出凭据模块）— 请只引用白名单子模块`)
      continue
    }

    const moduleName = rest.slice(1).split("/")[0]
    if (!ALLOWED_AUTH_MODULES.has(moduleName)) {
      violations.push(
        `${relative}:${line}  禁止在内容脚本引入凭据模块 — @/shared/auth/${moduleName}` +
          `（允许：${[...ALLOWED_AUTH_MODULES].join(" / ")}）`
      )
    }
  }
}

for (const dir of GUARDED_DIRS) {
  for (const file of listSourceFiles(dir)) {
    checkedFiles++
    checkFile(file)
  }
}

if (checkedFiles === 0) {
  console.error(`✘ 未扫描到任何文件，路径可能已变：${GUARDED_DIRS.join(" / ")}`)
  process.exit(1)
}

if (violations.length > 0) {
  console.error(`\n✘ 凭据边界检查失败（${violations.length} 处）：`)
  for (const violation of violations) console.error(`   - ${violation}`)
  console.error("\n说明：token 只能在 background 内使用，内容脚本只读 AuthSnapshot（见 docs 与 AGENTS.md 不变量 1）。")
  process.exit(1)
}

console.log(`✔ 凭据边界检查通过（扫描 ${checkedFiles} 个文件：${GUARDED_DIRS.join(" / ")}）`)
