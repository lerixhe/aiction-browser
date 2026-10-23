#!/usr/bin/env node
/**
 * 官方 API 的本地 mock 网关（dev 用，SPEC §13）。
 *
 * 用法：
 *   npm run mock:api                  # 起在 127.0.0.1:8787（与 shared/auth/config.ts 的 API_BASE 对齐）
 *   PORT=9000 npm run mock:api
 *   npm run mock:api -- --selftest    # 起临时端口跑完整流程断言，结束后自动退出
 *
 * 与 `scripts/store-screenshots/mock.mjs`（4173，商店截图用的假 SSE 端点）**无关**：
 * 那个只模仿 OpenAI 兼容的对话流，这个模仿官方账号与权益网关。
 *
 * ⚠️ 与真实网关的差异（**别拿这个文件当契约**）：
 *   1. 不校验 JWT 签名，只校验字符串；token 就是随机串；
 *   2. 不实现配额预扣 / 回填，`used` 是固定占位值；
 *   3. 不做 `ext_id` 与 `X-Ext-Id` 的一致性校验（只校验头是否存在）；
 *   4. `plan` 可任意切换（`?plan=` / `MOCK_PLAN`），没有订阅状态机与结算。
 *   契约真源：`.private-docs/OFFICIAL_API_CONTRACT.md`。
 *
 * 额度数值是**占位符**，且默认值刻意选得很小（`MOCK_QUOTA_LIMIT` 可覆盖）：
 * 真实额度只由服务端下发，客户端不得硬编码，公开仓库里也不放**看起来像真的**业务数值。
 * 默认 1000 的好处是：`used > 0` 时进度条直接拉到 100%，顺手把额度耗尽 / 402 的边缘路径跑到。
 *
 * 失败注入（环境变量，逗号分隔；`MOCK_FAIL=refresh_500,me_500`）：
 *   device_429        /auth/device 持续 429
 *   refresh_500       /auth/refresh 持续 500
 *   refresh_revoked   /auth/refresh 持续 401 refresh_revoked
 *   me_500            /v1/me 持续 500
 *   me_401_expired    /v1/me **下一次** 401 token_expired（验证「刷新一次后重试成功」）
 *   slow              每个请求延迟 3s（也可用 `?slow=3000`）
 * 另有运行期辅助端点：`GET /__state`（调用计数）、`POST /__expire`（把 token 标记过期）。
 */
import { createHash, randomBytes, randomUUID } from "node:crypto"
import http from "node:http"

const PORT = Number(process.env.PORT ?? 8787)
const GRACE_MS = 60_000
const CODE_TTL_MS = 5 * 60_000
const ACCESS_TTL_SECONDS = 900
const DEVICE_TTL_SECONDS = 30 * 24 * 60 * 60
const DEFAULT_QUOTA_LIMIT = 1_000

/** 契约 §1.3：除 Authorization 外的四个必需头（authorize 是浏览器导航，不校验） */
const BASE_HEADERS = ["x-ext-id", "x-client-version", "x-device-id", "x-platform"]

// ── 状态（全内存，重启即清）─────────────────────────────────────

const state = createState()

function createState() {
  return {
    /** device_id → { principalId, extId, createdAt } */
    devices: new Map(),
    /** userId → { email, plan, createdAt } */
    users: new Map(),
    /** device_id → userId（同设备重复登录复用同一用户） */
    deviceUser: new Map(),
    /** access_token → { kind, principalId, deviceId, expiresAt, expired } */
    accessTokens: new Map(),
    /** refresh_token → { userId, deviceId, extId, revoked, rotatedAt, rotatedTo } */
    refreshTokens: new Map(),
    /** code → { challenge, state, redirectUri, extId, plan, createdAt } */
    pendingCodes: new Map(),
    counters: { device: 0, authorize: 0, token: 0, refresh: 0, logout: 0, me: 0 }
  }
}

function resetState() {
  Object.assign(state, createState())
}

/** 失败注入集合：`me_401_expired` 一次性，其余持续生效 */
const failures = new Set(
  (process.env.MOCK_FAIL ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
)

function hasFailure(name) {
  return failures.has(name)
}

function takeFailure(name) {
  if (!failures.has(name)) return false
  failures.delete(name)
  return true
}

// ── 小工具 ─────────────────────────────────────────────────────

const token = (prefix) => `${prefix}_${randomBytes(24).toString("base64url")}`
const s256 = (verifier) => createHash("sha256").update(verifier, "ascii").digest("base64url")
const nowIso = () => new Date().toISOString()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function setCommonHeaders(res) {
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Ext-Id, X-Client-Version, X-Device-Id, X-Platform, X-AIction-Feature, X-Request-Id"
  )
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) })
  res.end(payload)
}

function sendEmpty(res, status) {
  res.writeHead(status)
  res.end()
}

/** 契约 §1.4 的错误体 */
function sendError(res, status, code, message, details) {
  sendJson(res, status, {
    error: {
      code,
      message,
      request_id: `req_${randomBytes(6).toString("hex")}`,
      ...(details ? { details } : {})
    }
  })
}

function sendHtml(res, status, html) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" })
  res.end(html)
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
  )
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    return null
  }
}

function bearerOf(req) {
  const header = req.headers.authorization
  if (typeof header !== "string") return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1] : null
}

/** 四个必需头都要在；缺失即 400（客户端漏头时立刻暴露，别等到线上） */
function requireBaseHeaders(req, res) {
  const missing = BASE_HEADERS.filter((name) => !req.headers[name])
  if (missing.length === 0) return true
  sendError(res, 400, "invalid_request", `缺少必需请求头：${missing.join(", ")}`)
  return false
}

/** redirect_uri 白名单（Chrome / Edge 用 chromiumapp.org，Firefox 用 allizom，另放行本地调试） */
function isRedirectAllowed(redirectUri, extId) {
  try {
    const url = new URL(redirectUri)
    if (url.protocol !== "https:") return false
    if (extId && url.hostname === `${extId}.chromiumapp.org`) return true
    if (url.hostname.endsWith(".extensions.allizom.org")) return true
    return url.hostname === "127.0.0.1" || url.hostname === "localhost"
  } catch {
    return false
  }
}

function callbackUrl(redirectUri, params) {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

// ── token 铸造 ─────────────────────────────────────────────────

function mintAccess(principal) {
  const value = token("at")
  state.accessTokens.set(value, {
    ...principal,
    expiresAt: Date.now() + ACCESS_TTL_SECONDS * 1000,
    expired: false
  })
  return value
}

function mintRefresh(record) {
  const value = token("rt")
  state.refreshTokens.set(value, { ...record, revoked: false, rotatedAt: null, rotatedTo: null })
  return value
}

function revokeDeviceRefresh(deviceId) {
  for (const record of state.refreshTokens.values()) {
    if (record.deviceId !== deviceId) continue
    record.revoked = true
    record.rotatedTo = null
  }
}

// ── 路由 ───────────────────────────────────────────────────────

async function handleRequest(req, res) {
  setCommonHeaders(res)

  let url
  try {
    url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`)
  } catch {
    return sendError(res, 400, "invalid_request", "无法解析请求 URL")
  }
  const path = url.pathname

  if (req.method === "OPTIONS") return sendEmpty(res, 204)

  const slow = Number(url.searchParams.get("slow") ?? 0)
  if (hasFailure("slow") || (Number.isFinite(slow) && slow > 0)) {
    await sleep(hasFailure("slow") ? 3000 : slow)
  }

  try {
    // ── 匿名设备 token ────────────────────────────────────────
    if (req.method === "POST" && path === "/auth/device") {
      state.counters.device++
      if (!requireBaseHeaders(req, res)) return
      if (hasFailure("device_429")) {
        res.setHeader("Retry-After", "3600")
        return sendError(res, 429, "rate_limited", "mock 注入的设备领取频控")
      }

      const body = await readJson(req)
      if (body === null) return sendError(res, 400, "invalid_request", "请求体不是合法 JSON")

      const deviceId = body.device_id ?? req.headers["x-device-id"]
      const extId = body.ext_id ?? req.headers["x-ext-id"]
      const platform = body.platform ?? req.headers["x-platform"]
      if (!deviceId || !extId) return sendError(res, 400, "invalid_request", "device_id 与 ext_id 必填")

      let device = state.devices.get(deviceId)
      if (!device) {
        device = { principalId: `device_${randomUUID()}`, extId, platform, createdAt: nowIso() }
        state.devices.set(deviceId, device)
      }

      const accessToken = mintAccess({ kind: "device", principalId: device.principalId, deviceId })
      return sendJson(res, 200, {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: DEVICE_TTL_SECONDS,
        principal: { kind: "device", id: device.principalId, plan: "anonymous" }
      })
    }

    // ── 授权页（浏览器导航，不是 XHR）──────────────────────────
    if (req.method === "GET" && path === "/auth/extension/authorize") {
      state.counters.authorize++
      const query = url.searchParams
      const extId = query.get("ext_id")
      const redirectUri = query.get("redirect_uri")
      const stateParam = query.get("state")
      const challenge = query.get("code_challenge")
      const challengeMethod = query.get("code_challenge_method")

      const missing = []
      if (!extId) missing.push("ext_id")
      if (!redirectUri) missing.push("redirect_uri")
      if (!stateParam) missing.push("state")
      if (!challenge) missing.push("code_challenge")
      if (missing.length > 0) {
        return sendHtml(res, 400, errorPage(`缺少参数：${missing.join(", ")}`))
      }
      if (challengeMethod !== "S256") {
        return sendHtml(res, 400, errorPage("code_challenge_method 必须是 S256"))
      }
      if (!isRedirectAllowed(redirectUri, extId)) {
        return sendHtml(res, 400, errorPage("redirect_uri 不在白名单（chromiumapp.org / extensions.allizom.org / 本地）"))
      }

      const code = token("code")
      const plan = query.get("plan") ?? process.env.MOCK_PLAN ?? "free"
      state.pendingCodes.set(code, {
        challenge,
        state: stateParam,
        redirectUri,
        extId,
        plan,
        createdAt: Date.now()
      })

      return sendHtml(
        res,
        200,
        authorizePage({
          code,
          redirectUri,
          stateParam,
          plan,
          extId,
          allowUrl: callbackUrl(redirectUri, { code, state: stateParam }),
          denyUrl: callbackUrl(redirectUri, { error: "access_denied", state: stateParam })
        })
      )
    }

    // ── code 换 token ─────────────────────────────────────────
    if (req.method === "POST" && path === "/auth/extension/token") {
      state.counters.token++
      if (!requireBaseHeaders(req, res)) return

      const body = await readJson(req)
      if (body === null) return sendError(res, 400, "invalid_request", "请求体不是合法 JSON")

      const code = body.code
      const verifier = body.code_verifier
      const pending = typeof code === "string" ? state.pendingCodes.get(code) : undefined

      // 一次性：**校验前就删**，失败也不留（防止用同一个 code 反复探测 PKCE）
      if (code) state.pendingCodes.delete(code)

      if (!pending) return sendError(res, 400, "invalid_request", "code 无效或已被使用")
      if (Date.now() - pending.createdAt > CODE_TTL_MS) {
        return sendError(res, 400, "invalid_request", "code 已过期")
      }
      if (typeof verifier !== "string" || s256(verifier) !== pending.challenge) {
        return sendError(res, 400, "invalid_request", "PKCE 校验失败")
      }

      const deviceId = body.device_id ?? req.headers["x-device-id"]
      const extId = body.ext_id ?? pending.extId

      let userId = state.deviceUser.get(deviceId)
      if (!userId) {
        userId = `user_${randomUUID()}`
        state.deviceUser.set(deviceId, userId)
        state.users.set(userId, { email: "u***@example.com", plan: pending.plan, createdAt: nowIso() })
      }

      const accessToken = mintAccess({ kind: "user", principalId: userId, deviceId })
      const refreshToken = mintRefresh({ userId, deviceId, extId })

      return sendJson(res, 200, {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: ACCESS_TTL_SECONDS,
        user: { id: userId, email: state.users.get(userId).email, created_at: state.users.get(userId).createdAt },
        plan: state.users.get(userId).plan
      })
    }

    // ── 刷新（轮换 + 60s 宽限）────────────────────────────────
    if (req.method === "POST" && path === "/auth/refresh") {
      state.counters.refresh++
      if (!requireBaseHeaders(req, res)) return
      if (hasFailure("refresh_500")) return sendError(res, 500, "internal", "mock 注入的刷新失败")
      if (hasFailure("refresh_revoked")) {
        return sendError(res, 401, "refresh_revoked", "mock 注入的撤销")
      }

      const body = await readJson(req)
      if (body === null) return sendError(res, 400, "invalid_request", "请求体不是合法 JSON")

      const value = body.refresh_token
      const record = typeof value === "string" ? state.refreshTokens.get(value) : undefined
      if (!record) return sendError(res, 401, "refresh_revoked", "refresh token 不存在")

      if (record.revoked) {
        const withinGrace =
          record.rotatedAt !== null && record.rotatedTo && Date.now() - record.rotatedAt <= GRACE_MS
        if (withinGrace) {
          // 宽限窗口内重放：返回**同一组**新 token（响应与首次完全相同）
          return sendJson(res, 200, record.rotatedTo)
        }
        // 超出宽限的重放：视为泄露，撤销该设备全部 refresh
        revokeDeviceRefresh(record.deviceId)
        return sendError(res, 401, "refresh_revoked", "refresh token 已撤销（重放超出宽限窗口）")
      }

      record.revoked = true
      record.rotatedAt = Date.now()

      const payload = {
        access_token: mintAccess({ kind: "user", principalId: record.userId, deviceId: record.deviceId }),
        refresh_token: mintRefresh({ userId: record.userId, deviceId: record.deviceId, extId: record.extId }),
        expires_in: ACCESS_TTL_SECONDS
      }
      record.rotatedTo = payload
      return sendJson(res, 200, payload)
    }

    // ── 登出 ──────────────────────────────────────────────────
    if (req.method === "POST" && path === "/auth/logout") {
      state.counters.logout++
      if (!requireBaseHeaders(req, res)) return
      const accessToken = bearerOf(req)
      const principal = accessToken ? state.accessTokens.get(accessToken) : undefined
      if (!principal) return sendError(res, 401, "token_invalid", "access token 无效")
      revokeDeviceRefresh(principal.deviceId)
      return sendEmpty(res, 204)
    }

    // ── 权益快照 ──────────────────────────────────────────────
    if (req.method === "GET" && path === "/v1/me") {
      state.counters.me++
      if (!requireBaseHeaders(req, res)) return

      const accessToken = bearerOf(req)
      if (!accessToken) return sendError(res, 401, "token_invalid", "缺少 Authorization")
      const principal = state.accessTokens.get(accessToken)
      if (!principal) return sendError(res, 401, "token_invalid", "access token 无效")

      // `me_401_expired` 一次性：第一次 401，客户端刷新后重试就能成功。
      // 时间上的过期**不自动发生**（否则自测要等 15 分钟），用 `POST /__expire` 注入。
      if (takeFailure("me_401_expired") || principal.expired) {
        return sendError(res, 401, "token_expired", "access token 已过期")
      }
      if (hasFailure("me_500")) return sendError(res, 500, "internal", "mock 注入的服务端错误")

      const user = principal.kind === "user" ? state.users.get(principal.principalId) : undefined
      const plan = url.searchParams.get("plan") ?? process.env.MOCK_PLAN ?? user?.plan ?? "anonymous"

      return sendJson(res, 200, {
        principal: {
          kind: principal.kind,
          id: principal.principalId,
          ...(user ? { email: user.email } : {}),
          created_at: user?.createdAt ?? state.devices.get(principal.deviceId)?.createdAt ?? nowIso()
        },
        plan,
        subscription: {
          status: plan === "free" || plan === "anonymous" ? "none" : "active",
          provider: "none",
          period_end: null,
          cancel_at_period_end: false,
          manage_url: null
        },
        quota: {
          unit: "tokens",
          limit: Number(process.env.MOCK_QUOTA_LIMIT ?? DEFAULT_QUOTA_LIMIT),
          used: 0,
          reserved: 0,
          reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          window: plan === "anonymous" ? "day" : "subscription"
        },
        features: {
          models: ["aiction-fast", "aiction-pro"],
          max_output_tokens: 8192,
          concurrency: 3,
          context_chars: 200_000
        },
        server_time: nowIso()
      })
    }

    // ── 调试端点 ──────────────────────────────────────────────
    if (req.method === "GET" && path === "/__state") {
      return sendJson(res, 200, {
        counters: state.counters,
        failures: [...failures],
        devices: state.devices.size,
        users: state.users.size,
        accessTokens: state.accessTokens.size,
        refreshTokens: [...state.refreshTokens.entries()].map(([value, record]) => ({
          token: `${value.slice(0, 10)}…`,
          userId: record.userId,
          deviceId: record.deviceId,
          revoked: record.revoked,
          // 距宽限窗口剩余毫秒（未轮换或已超时为 null）
          graceRemainingMs:
            record.revoked && record.rotatedAt !== null ? Math.max(0, GRACE_MS - (Date.now() - record.rotatedAt)) : null
        })),
        pendingCodes: state.pendingCodes.size
      })
    }

    if (req.method === "POST" && path === "/__expire") {
      const body = await readJson(req)
      const target = body?.token ?? url.searchParams.get("token")
      let expired = 0
      for (const [value, principal] of state.accessTokens) {
        if (target && value !== target) continue
        principal.expired = true
        expired++
      }
      return sendJson(res, 200, { expired })
    }

    if (req.method === "GET" && path === "/") {
      return sendHtml(res, 200, indexPage())
    }

    return sendError(res, 404, "invalid_request", `未知路径：${path}`)
  } catch (error) {
    console.error("[mock] 未捕获异常", error)
    return sendError(res, 500, "internal", error instanceof Error ? error.message : String(error))
  }
}

const server = http.createServer(handleRequest)

// ── 页面 ───────────────────────────────────────────────────────

function authorizePage({ code, redirectUri, stateParam, plan, extId, allowUrl, denyUrl }) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>AIction · 本地登录（mock）</title>
<style>
  body{font:14px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f7f9;color:#1c1c1e}
  main{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 32px;max-width:520px;box-shadow:0 8px 24px rgba(0,0,0,.06)}
  h1{font-size:17px;margin:0 0 4px}
  p{margin:10px 0;color:#4b5563}
  code{background:#f3f4f6;border-radius:4px;padding:1px 5px;font-size:12px}
  .row{display:flex;gap:10px;margin-top:22px;align-items:center}
  a.btn{display:inline-block;padding:9px 18px;border-radius:8px;text-decoration:none;font-weight:600}
  a.primary{background:#2563eb;color:#fff}
  a.ghost{color:#6b7280;border:1px solid #d1d5db}
  dl{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:16px 0 0;font-size:12px;color:#6b7280}
  dt{white-space:nowrap}
</style></head>
<body><main>
  <h1>本地 mock 登录</h1>
  <p>这不是真实账号系统：点「完成登录」即可拿到一组 token，用于联调扩展的登录链路。</p>
  <dl>
    <dt>ext_id</dt><dd><code>${escapeHtml(extId)}</code></dd>
    <dt>plan</dt><dd><code>${escapeHtml(plan)}</code></dd>
    <dt>code</dt><dd><code>${escapeHtml(code)}</code></dd>
    <dt>redirect_uri</dt><dd><code>${escapeHtml(redirectUri)}</code></dd>
    <dt>state</dt><dd><code>${escapeHtml(stateParam)}</code></dd>
  </dl>
  <div class="row">
    <a class="btn primary" href="${escapeHtml(allowUrl)}">完成登录</a>
    <a class="btn ghost" href="${escapeHtml(denyUrl)}">拒绝授权</a>
  </div>
</main></body></html>`
}

function errorPage(message) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>mock 授权页参数错误</title>
<style>body{font:14px/1.6 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f7f9}
main{background:#fff;border:1px solid #fecaca;border-radius:12px;padding:24px 28px;max-width:560px}
h1{font-size:16px;margin:0 0 8px;color:#b91c1c}code{background:#f3f4f6;padding:1px 5px;border-radius:4px}</style>
</head><body><main><h1>mock 授权页参数错误</h1><p>${escapeHtml(message)}</p></main></body></html>`
}

function indexPage() {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>AIction 官方 API · 本地 mock</title>
<style>body{font:14px/1.7 system-ui,sans-serif;margin:0;padding:32px;background:#f6f7f9;color:#1c1c1e}
main{max-width:760px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px 28px}
h1{font-size:17px;margin:0 0 12px}table{border-collapse:collapse;width:100%;font-size:13px}
td{padding:5px 8px;border-top:1px solid #f1f2f4;vertical-align:top}
td:first-child{white-space:nowrap;font-family:ui-monospace,monospace;color:#2563eb}code{background:#f3f4f6;padding:1px 5px;border-radius:4px}</style>
</head><body><main>
<h1>AIction 官方 API · 本地 mock</h1>
<p>状态全内存，重启即清。契约真源在私有文档里，这个服务只实现客户端要走的五条路径。</p>
<table>
<tr><td>POST /auth/device</td><td>领匿名设备 token（同 device_id 幂等）</td></tr>
<tr><td>GET /auth/extension/authorize</td><td>授权页：点「完成登录」即 302 回 <code>redirect_uri?code&amp;state</code></td></tr>
<tr><td>POST /auth/extension/token</td><td>code + PKCE verifier 换 token（code 一次性、5 分钟）</td></tr>
<tr><td>POST /auth/refresh</td><td>轮换 + 60s 宽限窗口（窗口内重放返回同一组新 token）</td></tr>
<tr><td>POST /auth/logout</td><td>撤销当前设备全部 refresh，204</td></tr>
<tr><td>GET /v1/me</td><td>权益快照（<code>?plan=pro</code> 可切换档位）</td></tr>
<tr><td>GET /__state</td><td>调试：调用计数与 refresh 宽限剩余时间</td></tr>
<tr><td>POST /__expire</td><td>调试：把 access token 标记过期，验证 401 救援</td></tr>
</table>
<p>失败注入：<code>MOCK_FAIL=refresh_500,me_500,device_429,me_401_expired,slow</code></p>
</main></body></html>`
}

// ── 启动 ───────────────────────────────────────────────────────

function listen(instance, port) {
  return new Promise((resolve, reject) => {
    instance.once("error", reject)
    instance.listen(port, "127.0.0.1", () => resolve(instance.address().port))
  })
}

function close(instance) {
  return new Promise((resolve) => instance.close(() => resolve()))
}

/**
 * 自测：把 SPEC §13 的验收（五个端点跑通 + 轮换与宽限可复现）变成可执行断言。
 * 用临时端口，不污染正在跑的 mock。
 */
async function runSelftest() {
  resetState()
  const instance = http.createServer(handleRequest)
  const port = await listen(instance, 0)
  const base = `http://127.0.0.1:${port}`

  let passed = 0
  const check = (label, condition) => {
    if (!condition) throw new Error(`自测失败：${label}`)
    passed++
    console.log(`  ✔ ${label}`)
  }

  const call = async (path, { method = "GET", body, accessToken, headers = {} } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        "x-ext-id": "mockextidforlocaldev",
        "x-client-version": "0.0.0",
        "x-device-id": "device-selftest",
        "x-platform": "chrome",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    })
    const text = await response.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { status: response.status, json, text }
  }

  const authorize = async (verifier, plan = "free") => {
    const challenge = s256(verifier)
    const redirectUri = "https://mockextidforlocaldev.chromiumapp.org/"
    const stateParam = `state_${randomBytes(8).toString("base64url")}`
    const query = new URLSearchParams({
      ext_id: "mockextidforlocaldev",
      platform: "chrome",
      state: stateParam,
      code_challenge: challenge,
      code_challenge_method: "S256",
      redirect_uri: redirectUri,
      plan
    })
    const page = await call(`/auth/extension/authorize?${query.toString()}`)
    const code = /[?&]code=([A-Za-z0-9_-]+)/.exec(page.text)?.[1]
    return { code, stateParam, redirectUri, status: page.status }
  }

  try {
    console.log("mock 网关自测")

    // 1. device 幂等
    const device1 = await call("/auth/device", {
      method: "POST",
      body: { device_id: "device-selftest", ext_id: "mockextidforlocaldev", platform: "chrome" }
    })
    check("POST /auth/device 返回 200 与 device 主体", device1.status === 200 && device1.json.principal.kind === "device")
    const device2 = await call("/auth/device", {
      method: "POST",
      body: { device_id: "device-selftest", ext_id: "mockextidforlocaldev", platform: "chrome" }
    })
    check("同 device_id 幂等（principal.id 不变）", device2.json.principal.id === device1.json.principal.id)

    // 2. 缺必需头 → 400
    const missingHeader = await call("/v1/me", { accessToken: device1.json.access_token, headers: { "x-client-version": "" } })
    check("缺 X-Client-Version → 400 invalid_request", missingHeader.status === 400 && missingHeader.json.error.code === "invalid_request")

    // 3. 授权页 + code
    const verifier = randomBytes(32).toString("base64url")
    const flow = await authorize(verifier)
    check("GET /auth/extension/authorize 返回 200 且页面含 code", flow.status === 200 && Boolean(flow.code))
    check("授权页包含回跳链接（code + state）", flow.redirectUri.length > 0)

    // 4. code 换 token
    const exchanged = await call("/auth/extension/token", {
      method: "POST",
      body: { code: flow.code, code_verifier: verifier, device_id: "device-selftest", ext_id: "mockextidforlocaldev", platform: "chrome" }
    })
    check(
      "POST /auth/extension/token 返回 access/refresh/plan",
      exchanged.status === 200 && Boolean(exchanged.json.access_token) && Boolean(exchanged.json.refresh_token) && exchanged.json.expires_in === 900
    )
    const access1 = exchanged.json.access_token
    const refresh1 = exchanged.json.refresh_token

    // 5. code 一次性
    const replay = await call("/auth/extension/token", {
      method: "POST",
      body: { code: flow.code, code_verifier: verifier, device_id: "device-selftest", ext_id: "mockextidforlocaldev", platform: "chrome" }
    })
    check("同一 code 重放 → 400", replay.status === 400)

    // 6. PKCE 校验失败（且失败也消耗 code）
    const wrongVerifierFlow = await authorize(randomBytes(32).toString("base64url"))
    const wrongPkce = await call("/auth/extension/token", {
      method: "POST",
      body: {
        code: wrongVerifierFlow.code,
        code_verifier: randomBytes(32).toString("base64url"),
        device_id: "device-selftest",
        ext_id: "mockextidforlocaldev",
        platform: "chrome"
      }
    })
    check("错 verifier → 400 invalid_request", wrongPkce.status === 400 && wrongPkce.json.error.code === "invalid_request")

    // 7. /v1/me
    const me = await call("/v1/me", { accessToken: access1 })
    check(
      "/v1/me 返回契约结构（principal/plan/quota/features/server_time）",
      me.status === 200 &&
        me.json.principal.kind === "user" &&
        Boolean(me.json.plan) &&
        typeof me.json.quota.limit === "number" &&
        Array.isArray(me.json.features.models) &&
        Boolean(me.json.server_time)
    )
    const noAuth = await call("/v1/me")
    check("无 Authorization → 401 token_invalid", noAuth.status === 401 && noAuth.json.error.code === "token_invalid")

    // 8. 401 token_expired → 刷新后重试（模拟客户端救援）
    await call("/__expire", { method: "POST", body: { token: access1 } })
    const expiredCall = await call("/v1/me", { accessToken: access1 })
    check("被标记过期的 access token → 401 token_expired", expiredCall.status === 401 && expiredCall.json.error.code === "token_expired")

    // 9. 刷新轮换
    const refreshed = await call("/auth/refresh", { method: "POST", body: { refresh_token: refresh1 } })
    check(
      "POST /auth/refresh 返回新 access/refresh（均已换新）",
      refreshed.status === 200 &&
        refreshed.json.access_token !== access1 &&
        refreshed.json.refresh_token !== refresh1
    )
    const access2 = refreshed.json.access_token
    const me2 = await call("/v1/me", { accessToken: access2 })
    check("刷新后的 access token 可用", me2.status === 200)

    // 10. 宽限窗口内重放旧 refresh → 同一组新 token
    const graceReplay = await call("/auth/refresh", { method: "POST", body: { refresh_token: refresh1 } })
    check(
      "宽限窗口内重放旧 refresh → 200 且返回同一组 token",
      graceReplay.status === 200 && graceReplay.json.access_token === access2
    )

    // 11. 超出宽限窗口 → 401 refresh_revoked
    const secondVerifier = randomBytes(32).toString("base64url")
    const flow2 = await authorize(secondVerifier)
    const exchanged2 = await call("/auth/extension/token", {
      method: "POST",
      body: { code: flow2.code, code_verifier: secondVerifier, device_id: "device-selftest", ext_id: "mockextidforlocaldev", platform: "chrome" }
    })
    const refresh2 = exchanged2.json.refresh_token
    const rotated2 = await call("/auth/refresh", { method: "POST", body: { refresh_token: refresh2 } })
    check("第二次登录的 refresh 也能轮换", rotated2.status === 200)
    const record = state.refreshTokens.get(refresh2)
    record.rotatedAt = Date.now() - GRACE_MS - 1000
    const outsideGrace = await call("/auth/refresh", { method: "POST", body: { refresh_token: refresh2 } })
    check("超出 60s 宽限的重放 → 401 refresh_revoked", outsideGrace.status === 401 && outsideGrace.json.error.code === "refresh_revoked")

    // 12. 登出撤销 refresh
    const logout = await call("/auth/logout", { method: "POST", accessToken: rotated2.json.access_token })
    check("POST /auth/logout → 204", logout.status === 204)
    const afterLogout = await call("/auth/refresh", { method: "POST", body: { refresh_token: rotated2.json.refresh_token } })
    check("登出后 refresh → 401", afterLogout.status === 401)

    // 13. 调试端点
    const snapshot = await call("/__state")
    check(
      "/__state 统计到各端点调用次数",
      snapshot.json.counters.device >= 2 && snapshot.json.counters.refresh >= 3 && snapshot.json.counters.me >= 3
    )

    console.log(`\n✔ mock 网关自测通过（${passed} 项断言）`)
    return 0
  } catch (error) {
    console.error(`\n✘ ${error instanceof Error ? error.message : String(error)}`)
    return 1
  } finally {
    await close(instance)
  }
}

if (process.argv.includes("--selftest")) {
  const code = await runSelftest()
  process.exit(code)
}

const actualPort = await listen(server, PORT)
console.log(`[mock] 官方 API mock 已启动： http://127.0.0.1:${actualPort}`)
console.log(`[mock] 授权页： http://127.0.0.1:${actualPort}/auth/extension/authorize?...`)
console.log(`[mock] 调试： GET /__state   POST /__expire`)
if (failures.size > 0) {
  console.log(`[mock] 已启用失败注入：${[...failures].join(", ")}`)
}
