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
 *   2. 不实现配额**预扣 / 回填**：进流前按 `输入字符数 / 4` 一次性记账（占位口径），
 *      `used` 会真的增长并与 `/v1/me` 共享同一份计数（客户端不需要第二套口径）；
 *   3. 不做 `ext_id` 与 `X-Ext-Id` 的一致性校验（只校验头是否存在）；
 *   4. `plan` 可任意切换（`?plan=` / `MOCK_PLAN`），没有订阅状态机与结算；
 *   5. `/v1/chat/completions` 只做 OpenAI 兼容的**最小子集**（SSE + 非流式 + usage chunk），
 *      不支持工具调用 / 多模态 / `stream_options`。
 *   契约真源：`.private-docs/OFFICIAL_API_CONTRACT.md`。
 *
 * 额度数值是**占位符**，且默认值刻意选得很小（`MOCK_QUOTA_LIMIT` 可覆盖）：
 * 真实额度只由服务端下发，客户端不得硬编码，公开仓库里也不放**看起来像真的**业务数值。
 * 默认 1000 的好处是：`used > 0` 时进度条直接拉到 100%，顺手把额度耗尽 / 402 的边缘路径跑到。
 *
 * 失败注入（环境变量，逗号分隔；`MOCK_FAIL=refresh_500,me_500`）：
 *   device_429        /auth/device 持续 429
 *   meta_500          /v1/meta 持续 500（验证「meta 拿不到时账号页只是少一张卡」）
 *   models_500        /v1/models 持续 500
 *   usage_500         /v1/me/usage 持续 500
 *   checkout_500      /v1/billing/checkout 持续 500
 *   refresh_500       /auth/refresh 持续 500
 *   refresh_revoked   /auth/refresh 持续 401 refresh_revoked
 *   me_500            /v1/me 持续 500
 *   me_401_expired    /v1/me **下一次** 401 token_expired（验证「刷新一次后重试成功」）
 *   chat_402          /v1/chat/completions 持续 402 quota_exceeded（额度墙 / 升级 CTA）
 *   chat_429          /v1/chat/completions 持续 429 rate_limited（带 Retry-After）
 *   chat_500          /v1/chat/completions 持续 500 internal
 *   slow              每个请求延迟 3s（也可用 `?slow=3000`）
 * 另有运行期辅助端点：`GET /__state`（调用计数）、`POST /__expire`（把 token 标记过期）。
 */
import { createHash, randomBytes, randomUUID } from "node:crypto"
import http from "node:http"

const PORT = Number(process.env.PORT ?? 8787)
/**
 * 刷新 token 的宽限窗口：**本地占位值**，不对应真实服务端配置
 *（宽限 / 频控这类风控阈值属服务端，按仓库边界不入库，契约真源在 `.private-docs/`）。
 * 需要验证「窗口内 / 窗口外」两端行为时用 `MOCK_GRACE_MS` 覆盖，不要改这里的默认值。
 */
const GRACE_MS = Number(process.env.MOCK_GRACE_MS ?? 60_000)
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
    /** principalId → 已用 tokens（占位口径，见 §「与真实网关的差异」） */
    quota: new Map(),
    /** Idempotency-Key → { url, sessionId, plan, interval, userId, createdAt }（契约 §1.6 / §7.1） */
    checkouts: new Map(),
    /** sessionId → { userId, plan, interval, createdAt }（等待「支付完成」） */
    sessions: new Map(),
    resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    counters: { device: 0, authorize: 0, token: 0, refresh: 0, logout: 0, me: 0, meta: 0, models: 0, usage: 0, checkout: 0, portal: 0, chat: 0 }
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
    "Authorization, Content-Type, X-Ext-Id, X-Client-Version, X-Device-Id, X-Platform, X-AIction-Feature, X-Request-Id, Idempotency-Key"
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

/**
 * Bearer → principal 的小工具。
 * 失败时已自己发过错误响应，调用方只需 `if (!principal) return`。
 */
function authenticate(req, res) {
  const accessToken = bearerOf(req)
  if (!accessToken) {
    sendError(res, 401, "token_invalid", "缺少 Authorization")
    return null
  }
  const principal = state.accessTokens.get(accessToken)
  if (!principal) {
    sendError(res, 401, "token_invalid", "access token 无效")
    return null
  }
  if (principal.expired) {
    sendError(res, 401, "token_expired", "access token 已过期")
    return null
  }
  return principal
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

// ── 额度（占位实现，见文件头「与真实网关的差异」第 2 条）──────────────

const quotaLimit = () => Number(process.env.MOCK_QUOTA_LIMIT ?? DEFAULT_QUOTA_LIMIT)
const quotaUsed = (principalId) => state.quota.get(principalId) ?? 0
const quotaResetAt = () => state.resetAt

/** 契约 §1.5：每次对话都带额度头，避免额外往返（流式响应同样带，值是**预扣后**的） */
function quotaHeaderObject(principalId, plan) {
  return {
    "X-Quota-Unit": "tokens",
    "X-Quota-Limit": String(quotaLimit()),
    "X-Quota-Used": String(quotaUsed(principalId)),
    "X-Quota-Reset": quotaResetAt(),
    ...(plan ? { "X-Plan": plan } : {})
  }
}

function setQuotaHeaders(res, principalId, plan) {
  for (const [name, value] of Object.entries(quotaHeaderObject(principalId, plan))) {
    res.setHeader(name, value)
  }
}

/** SSE 分片间隔：够慢到能看见流式，又快到自测不必等 */
const STREAM_CHUNK_DELAY_MS = Number(process.env.MOCK_STREAM_DELAY_MS ?? 15)

/** 官方模型白名单（占位：真实白名单由 `/v1/models` 下发，见契约 §5.1） */
const OFFICIAL_MODELS = ["aiction-fast", "aiction-pro"]

/**
 * `/v1/models` 的目录（契约 §5.1）。
 *
 * `min_plan` 不全是 `anonymous`：`aiction-pro` 要 `pro`，正好用来验证
 * 「客户端按档位过滤 / 选了一个买不起的模型会 403」两端行为。
 */
const MODEL_CATALOG = [
  {
    id: "aiction-fast",
    name: "AIction Fast",
    description: "Balanced speed and quality.",
    min_plan: "anonymous",
    context_chars: 100_000,
    max_output_tokens: 4096,
    supports_reasoning: false,
    recommended: true
  },
  {
    id: "aiction-pro",
    name: "AIction Pro",
    description: "Deeper reasoning for harder tasks.",
    min_plan: "pro",
    context_chars: 200_000,
    max_output_tokens: 8192,
    supports_reasoning: false,
    recommended: false
  }
]

/**
 * `/v1/meta` 的套餐表（契约 §4.3）。
 *
 * 价格与额度全是**占位数字**（`MOCK_PRICE_PRO` / `MOCK_QUOTA_PRO` 可覆盖），
 * 刻意不用任何「像真的」的价目：定价属于服务端，公开仓库里不该出现。
 */
const PLAN_CATALOG = [
  { id: "free", price: 0, currency: "CNY", interval: null, quota_tokens: 1_000 },
  {
    id: "pro",
    price: Number(process.env.MOCK_PRICE_PRO ?? 10),
    currency: "CNY",
    interval: "month",
    quota_tokens: Number(process.env.MOCK_QUOTA_PRO ?? 2_000)
  },
  {
    id: "max",
    price: Number(process.env.MOCK_PRICE_MAX ?? 20),
    currency: "CNY",
    interval: "month",
    quota_tokens: Number(process.env.MOCK_QUOTA_MAX ?? 4_000)
  },
  {
    id: "pro",
    price: Number(process.env.MOCK_PRICE_PRO_YEAR ?? 100),
    currency: "CNY",
    interval: "year",
    quota_tokens: Number(process.env.MOCK_QUOTA_PRO ?? 2_000)
  }
]

const CHECKOUT_REUSE_MS = 5 * 60_000

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

    // ── 刷新（轮换 + 宽限窗口）────────────────────────────────
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
          // 有值时客户端会跳过 `POST /v1/billing/portal`（契约 §7.2），用来验两条分支
          manage_url: process.env.MOCK_MANAGE_URL ?? null
        },
        quota: {
          unit: "tokens",
          limit: quotaLimit(),
          used: quotaUsed(principal.principalId),
          reserved: 0,
          reset_at: quotaResetAt(),
          window: plan === "anonymous" ? "day" : "subscription"
        },
        features: {
          models: ["aiction-fast", "aiction-pro"],
          // 下面三个数字全是**占位**（只为了让客户端拿到形状正确的数据），
          // 真实上限由服务端下发，客户端不得据此做任何判断。
          max_output_tokens: 8192,
          concurrency: 3,
          context_chars: 200_000
        },
        server_time: nowIso()
      })
    }


    // ── 服务端 meta（无需认证，契约 §4.3）────────────────────
    if (req.method === "GET" && path === "/v1/meta") {
      state.counters.meta++
      if (hasFailure("meta_500")) return sendError(res, 500, "internal", "mock 注入的 meta 失败")
      return sendJson(res, 200, {
        // 占位版本：默认识于任何已发布版本之下（不会误报「需要升级」）
        min_client_version: process.env.MOCK_MIN_VERSION ?? "0.0.1",
        maintenance: {
          active: process.env.MOCK_MAINTENANCE === "1",
          message: process.env.MOCK_MAINTENANCE_MESSAGE ?? null
        },
        plans: PLAN_CATALOG
      })
    }

    // ── 官方模型白名单（契约 §5.1）───────────────────────────
    if (req.method === "GET" && path === "/v1/models") {
      state.counters.models++
      if (!requireBaseHeaders(req, res)) return
      if (hasFailure("models_500")) return sendError(res, 500, "internal", "mock 注入的模型列表失败")
      if (!authenticate(req, res)) return
      // 返回**全量**目录（带 min_plan）：过滤是客户端的职责，与契约「客户端映射成选择列表」一致
      return sendJson(res, 200, { data: MODEL_CATALOG })
    }

    // ── 用量曲线（契约 §4.2）───────────────────────────────
    if (req.method === "GET" && path === "/v1/me/usage") {
      state.counters.usage++
      if (!requireBaseHeaders(req, res)) return
      if (hasFailure("usage_500")) return sendError(res, 500, "internal", "mock 注入的用量失败")
      const principal = authenticate(req, res)
      if (!principal) return

      // 客户端的真实请求是 `?granularity=day`（见 shared/auth/usage.ts）。
      // 不校验的话，客户端把参数名拼错在本地永远绿 —— 线上才会发现拿不到数据。
      const granularity = url.searchParams.get("granularity") ?? "day"
      if (granularity !== "day") {
        return sendError(res, 400, "invalid_request", `不支持的粒度：${granularity}`)
      }

      const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? process.env.MOCK_USAGE_DAYS ?? 7)))
      const points = []
      for (let offset = days - 1; offset >= 0; offset--) {
        const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        // 确定性占位数据：同一主体 + 同一天总是同一组数字（图表不会每次刷新都跳一下）
        const seed = quotaUsed(principal.principalId) + offset * 7 + 3
        points.push({ date, in_tokens: seed * 12, out_tokens: seed * 4, requests: (seed % 9) + 1 })
      }
      return sendJson(res, 200, { points })
    }

    // ── 结算会话（契约 §7.1）────────────────────────────────
    if (req.method === "POST" && path === "/v1/billing/checkout") {
      state.counters.checkout++
      if (!requireBaseHeaders(req, res)) return
      if (hasFailure("checkout_500")) return sendError(res, 500, "internal", "mock 注入的结算失败")
      const principal = authenticate(req, res)
      if (!principal) return
      if (principal.kind !== "user") {
        // 契约 §1.4：subscription_required 属 **402**（「钱/额度」通道），不是 403
        return sendError(res, 402, "subscription_required", "匿名设备不能创建结算会话，请先登录")
      }

      const idempotencyKey = req.headers["idempotency-key"]
      if (typeof idempotencyKey !== "string" || !idempotencyKey) {
        return sendError(res, 400, "invalid_request", "缺少 Idempotency-Key 请求头")
      }

      const body = await readJson(req)
      if (body === null) return sendError(res, 400, "invalid_request", "请求体不是合法 JSON")
      if (body.plan !== "pro" && body.plan !== "max") {
        return sendError(res, 400, "invalid_request", "plan 只能是 pro / max")
      }
      if (body.interval !== "month" && body.interval !== "year") {
        return sendError(res, 400, "invalid_request", "interval 只能是 month / year")
      }

      const existing = state.checkouts.get(idempotencyKey)
      if (existing && Date.now() - existing.createdAt <= CHECKOUT_REUSE_MS) {
        return sendJson(res, 200, {
          url: existing.url,
          session_id: existing.sessionId,
          expires_at: new Date(existing.createdAt + CHECKOUT_REUSE_MS).toISOString()
        })
      }

      const sessionId = `cs_${randomBytes(8).toString("hex")}`
      const origin = `http://${req.headers.host ?? `127.0.0.1:${PORT}`}`
      const record = {
        sessionId,
        url: `${origin}/billing/checkout?session=${sessionId}`,
        plan: body.plan,
        interval: body.interval,
        userId: principal.principalId,
        createdAt: Date.now()
      }
      state.checkouts.set(idempotencyKey, record)
      state.sessions.set(sessionId, record)
      return sendJson(res, 200, {
        url: record.url,
        session_id: sessionId,
        expires_at: new Date(Date.now() + CHECKOUT_REUSE_MS).toISOString()
      })
    }

    // ── 客户门户（契约 §7.2）───────────────────────────────
    if (req.method === "POST" && path === "/v1/billing/portal") {
      state.counters.portal++
      if (!requireBaseHeaders(req, res)) return
      if (!authenticate(req, res)) return
      const origin = `http://${req.headers.host ?? `127.0.0.1:${PORT}`}`
      return sendJson(res, 200, { url: `${origin}/billing/portal` })
    }

    // ── 假结算页（浏览器导航）─────────────────────────────
    if (req.method === "GET" && path === "/billing/checkout") {
      const sessionId = url.searchParams.get("session") ?? ""
      const record = state.sessions.get(sessionId)
      if (!record) return sendHtml(res, 404, errorPage("结算会话不存在或已过期"))
      return sendHtml(res, 200, checkoutPage(record))
    }

    if (req.method === "GET" && path === "/billing/portal") {
      return sendHtml(res, 200, portalPage())
    }

    /**
     * 假「服务端收到支付成功 webhook」：把该用户的 plan 换掉。
     * 真实网关由 `/webhooks/billing` → 落库 → `/v1/me` 反映新档位（契约 §7.3）。
     */
    if (req.method === "GET" && path === "/__pay") {
      const sessionId = url.searchParams.get("session") ?? ""
      const record = state.sessions.get(sessionId)
      if (!record) return sendHtml(res, 404, errorPage("结算会话不存在或已过期"))
      const user = state.users.get(record.userId)
      if (!user) return sendHtml(res, 404, errorPage("用户不存在"))
      user.plan = record.plan
      state.sessions.delete(sessionId)
      res.statusCode = 302
      res.setHeader("Location", `/billing/success?plan=${record.plan}&interval=${record.interval}`)
      return res.end()
    }

    if (req.method === "GET" && path === "/billing/success") {
      const plan = url.searchParams.get("plan") ?? ""
      const interval = url.searchParams.get("interval") ?? ""
      return sendHtml(res, 200, successPage(plan, interval))
    }

    // ── 官方对话（OpenAI 兼容子集，契约 §6）──────────────────
    if (req.method === "POST" && path === "/v1/chat/completions") {
      state.counters.chat++
      if (!requireBaseHeaders(req, res)) return

      // 计费主体是**请求头**（契约 §6.1）。缺了就在 dev 阶段 400，
      // 而不是等上线靠账单去发现「所有对话都记到同一个池」。
      const feature = req.headers["x-aiction-feature"]
      if (!feature) return sendError(res, 400, "invalid_request", "缺少 X-AIction-Feature 请求头")

      const accessToken = bearerOf(req)
      if (!accessToken) return sendError(res, 401, "token_invalid", "缺少 Authorization")
      const principal = state.accessTokens.get(accessToken)
      if (!principal) return sendError(res, 401, "token_invalid", "access token 无效")
      if (principal.expired) return sendError(res, 401, "token_expired", "access token 已过期")

      if (hasFailure("chat_500")) return sendError(res, 500, "internal", "mock 注入的服务端错误")
      if (hasFailure("chat_429")) {
        res.setHeader("Retry-After", "10")
        return sendError(res, 429, "rate_limited", "mock 注入的分钟级频控")
      }

      const body = await readJson(req)
      if (!body || !Array.isArray(body.messages)) {
        return sendError(res, 400, "invalid_request", "messages 必须是数组")
      }
      const model = typeof body.model === "string" ? body.model : ""
      if (!OFFICIAL_MODELS.includes(model)) {
        return sendError(res, 403, "model_not_allowed", `模型不在白名单：${model || "(空)"}`)
      }

      const user = principal.kind === "user" ? state.users.get(principal.principalId) : undefined
      const plan = user?.plan ?? "anonymous"
      const limit = quotaLimit()
      const used = quotaUsed(principal.principalId)

      // 额度耗尽 → **402**（不是 429）：402 对应升级引导，429 只表示「稍后重试」
      if (hasFailure("chat_402") || used >= limit) {
        setQuotaHeaders(res, principal.principalId, plan)
        return sendError(res, 402, "quota_exceeded", "本周期额度耗尽", {
          limit,
          used,
          reset_at: quotaResetAt()
        })
      }

      const inputChars = body.messages.reduce(
        (sum, message) => sum + (typeof message?.content === "string" ? message.content.length : 0),
        0
      )
      // 占位估算（契约 §6.5 的预扣 / 回填真实网关才做，这里只让 used 会动）
      const charged = Math.max(1, Math.round(inputChars / 4))
      state.quota.set(principal.principalId, used + charged)

      const lastUser = [...body.messages].reverse().find((message) => message?.role === "user")
      const echoed = typeof lastUser?.content === "string" ? lastUser.content.slice(0, 80) : ""
      const reply = `[mock:${feature}] ${model} 收到 ${body.messages.length} 条消息：${echoed}`
      const id = `chatcmpl_mock_${randomBytes(4).toString("hex")}`
      const created = Math.floor(Date.now() / 1000)

      if (body.stream === false) {
        setQuotaHeaders(res, principal.principalId, plan)
        return sendJson(res, 200, {
          id,
          object: "chat.completion",
          created,
          model,
          choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
          usage: {
            prompt_tokens: charged,
            completion_tokens: reply.length,
            total_tokens: charged + reply.length
          }
        })
      }

      // SSE：头在流开始前发出，所以 `X-Quota-Used` 是**预扣后**的值（契约 §1.5）
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        ...quotaHeaderObject(principal.principalId, plan)
      })

      const sendChunk = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`)
      sendChunk({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }]
      })

      for (const piece of reply.match(/[\s\S]{1,12}/g) ?? []) {
        // 客户端中途断开（AbortSignal）：Gateway 应立即取消上游，这里直接停写
        if (res.writableEnded || res.destroyed) return
        sendChunk({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: { content: piece }, finish_reason: null }]
        })
        await sleep(STREAM_CHUNK_DELAY_MS)
      }

      sendChunk({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
      })
      // usage chunk 由网关补在 [DONE] 之前（契约 §6.3），AI SDK 会解析它
      sendChunk({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [],
        usage: {
          prompt_tokens: charged,
          completion_tokens: reply.length,
          total_tokens: charged + reply.length
        }
      })
      res.write("data: [DONE]\n\n")
      res.end()
      return
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
        pendingCodes: state.pendingCodes.size,
        checkouts: state.checkouts.size,
        sessions: state.sessions.size,
        quota: Object.fromEntries(state.quota)
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
<tr><td>POST /auth/refresh</td><td>轮换 + 宽限窗口（窗口内重放返回同一组新 token）</td></tr>
<tr><td>POST /auth/logout</td><td>撤销当前设备全部 refresh，204</td></tr>
<tr><td>GET /v1/me</td><td>权益快照（<code>?plan=pro</code> 可切换档位）</td></tr>
<tr><td>GET /v1/meta</td><td>版本门槛 / 维护公告 / 套餐表（无需认证）</td></tr>
<tr><td>GET /v1/models</td><td>官方模型白名单（带 <code>min_plan</code>）</td></tr>
<tr><td>GET /v1/me/usage</td><td>用量曲线（近 7 天占位数据）</td></tr>
<tr><td>POST /v1/billing/checkout</td><td>结算会话（<code>Idempotency-Key</code> 必填，5 分钟内同 key 同 URL）</td></tr>
<tr><td>POST /v1/billing/portal</td><td>客户门户地址</td></tr>
<tr><td>GET /billing/checkout</td><td>假结算页：点「模拟支付完成」即升档（给轮询用）</td></tr>
<tr><td>POST /v1/chat/completions</td><td>官方对话（SSE，带 <code>X-Quota-*</code> 头；额度耗尽 402）</td></tr>
<tr><td>GET /__state</td><td>调试：调用计数与 refresh 宽限剩余时间</td></tr>
<tr><td>POST /__expire</td><td>调试：把 access token 标记过期，验证 401 救援</td></tr>
</table>
<p>失败注入：<code>MOCK_FAIL=refresh_500,me_500,device_429,me_401_expired,meta_500,models_500,usage_500,checkout_500,slow</code></p>
</main></body></html>`
}

/** 假结算页（契约 §7.1）：真实环境这里会跳到 Paddle / Stripe，本地只需要一个能「完成支付」的按钮 */
function checkoutPage(record) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>AIction · 本地结算（mock）</title>
<style>body{font:14px/1.7 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f7f9;color:#1c1c1e}
main{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 32px;max-width:520px;box-shadow:0 8px 24px rgba(0,0,0,.06)}
h1{font-size:17px;margin:0 0 12px}p{color:#4b5563;margin:8px 0}
.row{display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid #f1f2f4}
.btn{display:inline-block;margin-top:20px;padding:10px 18px;border-radius:8px;background:#3b82f6;color:#fff;text-decoration:none;font-weight:600}
code{background:#f3f4f6;padding:1px 5px;border-radius:4px}</style>
</head><body><main>
<h1>本地结算（mock）</h1>
<p>这个页面只存在于 dev mock。真实环境这里会是支付服务商的页面，卡号永远不会经过扩展。</p>
<div class="row"><span>会话</span><code>${escapeHtml(record.sessionId)}</code></div>
<div class="row"><span>套餐</span><b>${escapeHtml(record.plan)}</b></div>
<div class="row"><span>周期</span><b>${escapeHtml(record.interval)}</b></div>
<a class="btn" href="/__pay?session=${encodeURIComponent(record.sessionId)}">模拟支付完成</a>
<p style="margin-top:18px;font-size:12px;color:#6b7280">点下去之后：网关该用户的 plan 会真的变；扩展里的账号页靠 3s 轮询发现它。</p>
</main></body></html>`
}

function successPage(plan, interval) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>AIction · 支付完成（mock）</title>
<style>body{font:14px/1.7 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f7f9;color:#1c1c1e}
main{background:#fff;border:1px solid #d1fae5;border-radius:12px;padding:28px 32px;max-width:520px}
h1{font-size:17px;margin:0 0 10px;color:#047857}p{color:#4b5563}</style>
</head><body><main>
<h1>支付完成（mock）</h1>
<p>plan = <b>${escapeHtml(plan || "-")}</b>${interval ? ` / ${escapeHtml(interval)}` : ""}</p>
<p>回到扩展的设置页，额度与套餐应该会在几秒内自动刷新。</p>
</main></body></html>`
}

function portalPage() {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>AIction · 客户门户（mock）</title>
<style>body{font:14px/1.7 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f7f9;color:#1c1c1e}
main{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 32px;max-width:520px}
h1{font-size:17px;margin:0 0 10px}p{color:#4b5563}</style>
</head><body><main>
<h1>客户门户（mock）</h1>
<p>改卡 / 取消订阅 / 发票都在这里（真实环境由支付服务商提供）。</p>
<p>用 <code>MOCK_MANAGE_URL</code> 可以让 <code>/v1/me.subscription.manage_url</code> 有值，验证「有值就不调 portal 接口」这条分支。</p>
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
    return { status: response.status, json, text, headers: Object.fromEntries(response.headers) }
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
    check(`超出宽限窗口（${GRACE_MS / 1000}s）的重放 → 401 refresh_revoked`, outsideGrace.status === 401 && outsideGrace.json.error.code === "refresh_revoked")

    // 12. 登出撤销 refresh
    const logout = await call("/auth/logout", { method: "POST", accessToken: rotated2.json.access_token })
    check("POST /auth/logout → 204", logout.status === 204)
    const afterLogout = await call("/auth/refresh", { method: "POST", body: { refresh_token: rotated2.json.refresh_token } })
    check("登出后 refresh → 401", afterLogout.status === 401)

    // 13. 官方对话（M2）：SSE + 额度头 + 402
    const chatBase = {
      method: "POST",
      accessToken: device1.json.access_token,
      body: {
        model: "aiction-fast",
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "hello official" }
        ],
        stream: true
      }
    }
    const chat = await call("/v1/chat/completions", {
      ...chatBase,
      headers: { "x-aiction-feature": "selection_chat" }
    })
    check("POST /v1/chat/completions 返回 SSE 流", chat.status === 200 && chat.text.includes("data: "))
    check("流内含 usage chunk 与 [DONE]", chat.text.includes("\"usage\"") && chat.text.includes("[DONE]"))
    // 额度头要真的从 **header** 上验（body 里有 used 不算数，客户端读的是 header）
    check(
      "SSE 响应头带契约 §1.5 的额度头",
      chat.headers["x-quota-unit"] === "tokens" &&
        Number(chat.headers["x-quota-limit"]) > 0 &&
        Number(chat.headers["x-quota-used"]) > 0 &&
        Boolean(chat.headers["x-quota-reset"])
    )
    const firstUsed = Number(chat.headers["x-quota-used"])
    const chat2 = await call("/v1/chat/completions", {
      ...chatBase,
      headers: { "x-aiction-feature": "page_qa" }
    })
    check(
      "额度头是**预扣后**的值（第二次请求的 used 严格更大）",
      Number(chat2.headers["x-quota-used"]) > firstUsed
    )

    const chatNoFeature = await call("/v1/chat/completions", chatBase)
    check("缺 X-AIction-Feature → 400（计费主体必须显式）", chatNoFeature.status === 400)

    const chatBadModel = await call("/v1/chat/completions", {
      ...chatBase,
      body: { ...chatBase.body, model: "not-a-model" },
      headers: { "x-aiction-feature": "selection_chat" }
    })
    check("模型不在白名单 → 403 model_not_allowed", chatBadModel.status === 403 && chatBadModel.json.error.code === "model_not_allowed")

    // 额度耗尽 → 402（把该主体的 used 顶到上限，验证客户端拿到的额度头也是满的）
    const devicePrincipalId = device1.json.principal.id
    const limit = quotaLimit()
    state.quota.set(devicePrincipalId, limit)
    const chatQuota = await call("/v1/chat/completions", {
      ...chatBase,
      headers: { "x-aiction-feature": "page_qa" }
    })
    check("额度耗尽 → 402 quota_exceeded（不是 429）", chatQuota.status === 402 && chatQuota.json.error.code === "quota_exceeded")
    check(
      "402 的响应**头**也带额度（UI 可立刻画满，而不是去读错误体）",
      Number(chatQuota.headers["x-quota-used"]) >= Number(chatQuota.headers["x-quota-limit"])
    )
    state.quota.set(devicePrincipalId, 0)

    // 14. 客户端中途断开（契约 §6.1/§6.4：网关应停止上游，不把半截流当成功）
    state.quota.set(devicePrincipalId, 0)
    const abortController = new AbortController()
    const aborted = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "x-ext-id": "mockextidforlocaldev",
        "x-client-version": "0.0.0",
        "x-device-id": "device-selftest",
        "x-platform": "chrome",
        "x-aiction-feature": "selection_chat",
        authorization: `Bearer ${device1.json.access_token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ model: "aiction-fast", messages: [{ role: "user", content: "abort me" }], stream: true }),
      signal: abortController.signal
    })
    const reader = aborted.body.getReader()
    await reader.read()
    abortController.abort()
    check("客户端中途断开后 mock 不崩（后续请求仍可用）", (await call("/v1/me", { accessToken: device1.json.access_token })).status === 200)
    state.quota.set(devicePrincipalId, 0)

    // 15. M3：meta / models / usage / 结算
    const meta = await call("/v1/meta")
    check(
      "/v1/meta 返回套餐表（免费档 0 价 + 有价档只出现在 pro/max）",
      meta.status === 200 &&
        meta.json.plans.some((plan) => plan.price === 0) &&
        meta.json.plans.filter((plan) => plan.price > 0).every((plan) => plan.id === "pro" || plan.id === "max")
    )

    const models = await call("/v1/models", { accessToken: access2 })
    check(
      "/v1/models 返回带 min_plan 的白名单",
      models.status === 200 &&
        models.json.data.length >= 2 &&
        models.json.data.every((model) => typeof model.min_plan === "string")
    )
    check(
      "白名单里确实存在需要付费档的模型（否则「按档位过滤」验不到）",
      models.json.data.some((model) => model.min_plan !== "anonymous" && model.min_plan !== "free")
    )

    const usage = await call("/v1/me/usage?granularity=day&days=7", { accessToken: access2 })
    check(
      "/v1/me/usage 返回 7 个点且日期升序",
      usage.status === 200 &&
        usage.json.points.length === 7 &&
        usage.json.points[0].date < usage.json.points[6].date
    )

    const badGranularity = await call("/v1/me/usage?granularity=hour", { accessToken: access2 })
    check("usage 粒度不是 day → 400（客户端参数写错要能被本地抓到）", badGranularity.status === 400)

    const noKey = await call("/v1/billing/checkout", {
      method: "POST",
      accessToken: access2,
      body: { plan: "pro", interval: "month" }
    })
    check("checkout 缺 Idempotency-Key → 400", noKey.status === 400 && noKey.json.error.code === "invalid_request")

    const checkout = await call("/v1/billing/checkout", {
      method: "POST",
      accessToken: access2,
      headers: { "idempotency-key": "idem-selftest" },
      body: { plan: "pro", interval: "month" }
    })
    check(
      "checkout 返回可打开的 url 与 session_id",
      checkout.status === 200 &&
        typeof checkout.json.url === "string" &&
        checkout.json.url.startsWith("http") &&
        typeof checkout.json.session_id === "string"
    )

    const replayCheckout = await call("/v1/billing/checkout", {
      method: "POST",
      accessToken: access2,
      headers: { "idempotency-key": "idem-selftest" },
      body: { plan: "pro", interval: "month" }
    })
    check("同 Idempotency-Key 5 分钟内返回同一 URL", replayCheckout.json.url === checkout.json.url)

    const meBeforePay = await call("/v1/me", { accessToken: access2 })
    check("只创建结算会话时 plan 不变（等支付完成才变）", meBeforePay.json.plan === "free")

    const pay = await fetch(`${base}/__pay?session=${checkout.json.session_id}`, { redirect: "manual" })
    check("__pay 302 到成功页", pay.status === 302)
    const meAfterPay = await call("/v1/me", { accessToken: access2 })
    check("支付完成后 /v1/me 反映新档位（pro）", meAfterPay.json.plan === "pro")

    const portal = await call("/v1/billing/portal", { method: "POST", accessToken: access2 })
    check("portal 返回客户门户地址", portal.status === 200 && typeof portal.json.url === "string")

    // 16. 调试端点
    const snapshot = await call("/__state")
    check(
      "/__state 统计到各端点调用次数",
      snapshot.json.counters.device >= 2 &&
        snapshot.json.counters.refresh >= 3 &&
        snapshot.json.counters.me >= 3 &&
        snapshot.json.counters.meta >= 1 &&
        snapshot.json.counters.checkout >= 2
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
