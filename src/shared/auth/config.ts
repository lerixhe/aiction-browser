/**
 * 登录链路的外部地址与时间常量。
 *
 * 所有 `https://api.aiction.app` / `https://aiction.app` 的拼接**只在本文件**出现：
 * SPEC §6 明确「其余模块不得自己拼」。
 *
 * ⚠️ M3 曾计划「改成从 `/v1/meta` 下发地址」，但契约 §4.3 的 `/v1/meta` 只有
 * `min_client_version` / `maintenance` / `plans`，**没有 `apiBaseUrl`**。
 * 因此网关地址仍是构建期常量（dev 与 prod 包各指向自己的端点，这正是产物可区分的基础），
 * 不为了一个不存在的字段去加一条运行时改地址的路径。
 */

/**
 * 本地 / CI 覆盖端点：扩展运行时没有 `process`（恒为 undefined），
 * 只在 tsx 脚本与 CI 冒烟里用来把代码指向 mock 网关。
 */
function endpointOverride(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return env?.AICTION_API_BASE || undefined
}

/** 官方 API 网关。dev 走本地 mock（`scripts/mock-official-api.mjs`，见 SPEC §13） */
export const API_BASE =
  endpointOverride() ?? (import.meta.env?.DEV ? "http://127.0.0.1:8787" : "https://api.aiction.app")

/** 官网（授权页 / 定价页 / 账单页）。dev 走本地假站点 */
export const WEB_BASE = import.meta.env?.DEV ? "http://127.0.0.1:8788" : "https://aiction.app"

/** 契约 §1.3 的 `X-Platform` 取值；只支持这三家，其它（safari / opera）按 chrome 报 */
export type Platform = "chrome" | "firefox" | "edge"

function detectPlatform(): Platform {
  const browser = import.meta.env?.BROWSER
  if (browser === "firefox") return "firefox"
  if (browser === "edge") return "edge"
  return "chrome"
}

export const PLATFORM: Platform = detectPlatform()

/** access token 提前刷新窗口：剩不到 5 分钟就刷新，避免临界失败（Selectly 的做法） */
export const REFRESH_BUFFER_MS = 5 * 60_000

/** 登录挂起态（state + verifier）的存活时间，超时一律按 STATE_MISMATCH 处理 */
export const PENDING_TTL_MS = 5 * 60_000

/** device token 提前续签窗口 */
export const DEVICE_RENEW_BUFFER_MS = 7 * 24 * 60 * 60_000

/** `/v1/me` 权益缓存 TTL（402 / 登录 / 登出 / 账号页可见时强制回源） */
export const ENTITLEMENTS_TTL_MS = 5 * 60_000

/** `/v1/meta` 缓存 TTL（价格 / 维护公告这类内容改得不频繁，失败不缓存） */
export const META_TTL_MS = 60 * 60_000

/** `/v1/models` 缓存 TTL（契约 §8：24h；模型白名单随发版变，不需要更短） */
export const OFFICIAL_MODELS_TTL_MS = 24 * 60 * 60_000

/** `/v1/me/usage` 缓存 TTL：切分区再回来不重复打（手动刷新 / 重新进入会越过） */
export const USAGE_TTL_MS = 60_000

/**
 * 结算后轮询 `/v1/me` 的节奏（契约 §7.1：3s × 100 次 ≈ 5 分钟）。
 *
 * 之所以放在 background 而不是 UI：用户点完升级会跳到外部结算页，Options 页此时在后台，
 * 定时器照跑但**没人看结果**，而「付完钱回来额度还是旧的」正是最刺眼的一类 bug。
 */
export const CHECKOUT_POLL_INTERVAL_MS = 3_000
export const CHECKOUT_POLL_MAX_ATTEMPTS = 100

/**
 * 结算会话的**本地幂等窗口**（契约 §1.6：同 `Idempotency-Key` 5 分钟内返回同一 URL）。
 *
 * 命中窗口内复用上一次的结果，避免「升级按钮点了两下 = 两个结算会话」。
 */
export const CHECKOUT_REUSE_WINDOW_MS = 5 * 60_000

/**
 * 官方服务**兜底**模型名（`/v1/models` 拉不到时才用）。
 *
 * M3 起真实可选项来自 `GET /v1/models`（契约 §5.1），选择器写 `settings.officialModel`；
 * 这个常量只是「白名单没拿到」时的安全默认值——白名单一旦可用，它就不再参与决策。
 */
export const DEFAULT_OFFICIAL_MODEL = "aiction-fast"

/**
 * 登录入口的构建期开关（SPEC §15 的回滚手段）。
 * 出问题时发一个小版本置 false 即可关掉所有入口，不需要再加一个需要迁移的设置字段。
 */
export const OFFICIAL_AUTH_ENABLED = true

/**
 * **官方 AI 链路是否已接线**（M1 = false，M2 = true）。
 *
 * 与 `OFFICIAL_AUTH_ENABLED` 分开：登录（拿会话）与用会话发聊天是两件事。
 * 置 true 的条件（M2 已全部满足）：`provider-credentials.ts` 能取到凭据、
 * `background.streamChat` 走 `resolveActiveProvider` + `resolveProvider`。
 *
 * 回滚方式：置 false 发一个小版本——`resolveActiveProvider` 会直接返回 BYOK，
 * 界面也随之只显示真实引擎（不会出现「显示官方服务、请求发到 BYOK」的偏差）。
 */
export const OFFICIAL_AI_ENABLED = true

/** 官网路由（`actions.ts` 与 `pkce.ts` 共用） */
export const WEB_ROUTES = {
  login: "/login",
  pricing: "/pricing",
  billing: "/billing"
} as const

/**
 * 授权页归属：契约 §3.2 的 URL 属于 **Web 域**（浏览器导航 + Cookie 会话），
 * 所以生产必须走 `WEB_BASE`；dev 下由 mock 网关兼任（它能直接扮演授权页，省一个服务）。
 */
export const AUTHORIZE_BASE = endpointOverride() ?? (import.meta.env?.DEV ? API_BASE : WEB_BASE)
