/**
 * 登录链路的外部地址与时间常量。
 *
 * 所有 `https://api.aiction.app` / `https://aiction.app` 的拼接**只在本文件**出现：
 * SPEC §6 明确「其余模块不得自己拼」。M2 会改成从 `/v1/meta` 下发，届时只动这里。
 */

/** 官方 API 网关。dev 走本地 mock（`scripts/mock-official-api.mjs`，见 SPEC §13） */
export const API_BASE = import.meta.env?.DEV ? "http://127.0.0.1:8787" : "https://api.aiction.app"

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

/**
 * 官方服务默认模型名（M1 只用于展示）。未登录时 Popup 不显示官方服务行。
 * TODO(M2): 改为从 `/v1/meta` 的可用模型列表里取默认项。
 */
export const DEFAULT_OFFICIAL_MODEL = "aiction-fast"

/**
 * 登录入口的构建期开关（SPEC §15 的回滚手段）。
 * 出问题时发一个小版本置 false 即可关掉所有入口，不需要再加一个需要迁移的设置字段。
 */
export const OFFICIAL_AUTH_ENABLED = true

/** 官网路由（`actions.ts` 与 `pkce.ts` 共用） */
export const WEB_ROUTES = {
  login: "/login",
  pricing: "/pricing",
  billing: "/billing"
} as const
