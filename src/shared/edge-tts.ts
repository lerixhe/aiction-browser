// Edge 在线语音合成（background 专用）
//
// 实现路线（经 read-frog 扩展生产验证）：
// 1. 用第一方 MSTranslatorAndroidApp 签名（HMAC-SHA256）向微软翻译端点换取 Azure TTS JWT
// 2. 携带 JWT 向 Azure TTS REST 接口 POST SSML，直接返回 MP3 音频
//
// 注意：只能在 background service worker 中调用（需要访问外部网络）。

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
const ENDPOINT_URL = "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0"
const SIGNATURE_APP_ID = "MSTranslatorAndroidApp"
const SIGNATURE_SECRET_BASE64 = "oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw=="
const CLIENT_VERSION = "4.0.530a 5fe1dc6c"
const USER_ID = "0f04d16a175c411e"
const HOME_REGION = "zh-Hans-CN"
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3"
const CONTENT_TYPE = "audio/mpeg"

// 单次请求的文本分块上限（UTF-8 字节）与分块数量上限
const MAX_CHUNK_BYTES = 1800
const MAX_CHUNKS = 60
// token 过期前提前刷新的余量
const TOKEN_REFRESH_BEFORE_EXPIRY_MS = 3 * 60 * 1000
// token 拿不到 exp 字段时的兜底有效期
const DEFAULT_TOKEN_TTL_MS = 10 * 60 * 1000
// 单块合成请求超时
const SYNTH_TIMEOUT_MS = 30_000
// 换 token 请求超时
const TOKEN_TIMEOUT_MS = 15_000

interface EndpointToken {
  /** Azure TTS JWT（Authorization header 用） */
  token: string
  /** 区域主机名，如 "zh-Hans-CN" 对应 {r}.tts.speech.microsoft.com 的 r */
  region: string
  /** 过期时间（毫秒时间戳） */
  expiredAt: number
}

interface EdgeTtsSynthesizeResult {
  audioBase64: string
  contentType: string
}

let cachedToken: EndpointToken | null = null

// ---------- 工具函数 ----------

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function hmacSha256Base64(key: Uint8Array, data: string): Promise<string> {
  const keyBuffer = new ArrayBuffer(key.byteLength)
  new Uint8Array(keyBuffer).set(key)
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** 移除 SSML 不接受的 C0/C1 控制字符 */
function sanitizeText(text: string): string {
  return [...text]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return !(code <= 8 || (code >= 11 && code <= 12) || (code >= 14 && code <= 31))
    })
    .join("")
}

function measureBytes(text: string): number {
  return new TextEncoder().encode(text).length
}

// ---------- token 获取与缓存 ----------

function decodeJwtExpiryMs(token: string): number | null {
  const payloadBase64 = token.split(".")[1]
  if (!payloadBase64) return null
  try {
    const normalized = payloadBase64.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
    const payload = JSON.parse(atob(padded)) as { exp?: number }
    return typeof payload.exp === "number" ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

function buildTranslatorSignature(now = new Date()): Promise<string> {
  // date 形如 "mon, 01 jan 2024 00:00:00 GMT"
  const date = `${now.toUTCString().replace(/GMT/, "").trim().toLowerCase()} GMT`
  const requestId = crypto.randomUUID().replace(/-/g, "")
  const encodedUrl = encodeURIComponent(ENDPOINT_URL.split("://")[1] ?? "")
  const payload = `${SIGNATURE_APP_ID}${encodedUrl}${date}${requestId}`.toLowerCase()
  return hmacSha256Base64(base64ToBytes(SIGNATURE_SECRET_BASE64), payload).then(
    (signature) => `${SIGNATURE_APP_ID}::${signature}::${date}::${requestId}`
  )
}

export function clearEdgeTtsTokenCache(): void {
  cachedToken = null
}

async function getEndpointToken(): Promise<EndpointToken> {
  const now = Date.now()
  if (cachedToken && now < cachedToken.expiredAt - TOKEN_REFRESH_BEFORE_EXPIRY_MS) {
    return cachedToken
  }

  const signature = await buildTranslatorSignature()
  const response = await fetch(ENDPOINT_URL, {
    method: "POST",
    headers: {
      "Accept-Language": "zh-Hans",
      "X-ClientVersion": CLIENT_VERSION,
      "X-UserId": USER_ID,
      "X-HomeGeographicRegion": HOME_REGION,
      "X-ClientTraceId": crypto.randomUUID().replace(/-/g, ""),
      "X-MT-Signature": signature,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: "",
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS)
  })

  if (!response.ok) {
    throw new Error(`token endpoint ${response.status}`)
  }

  const data = (await response.json()) as { t?: unknown; r?: unknown }
  if (typeof data.t !== "string" || typeof data.r !== "string" || !data.t || !data.r) {
    throw new Error("token endpoint returned invalid payload")
  }

  const expiredAt = decodeJwtExpiryMs(data.t) ?? now + DEFAULT_TOKEN_TTL_MS
  cachedToken = { token: data.t, region: data.r, expiredAt }
  return cachedToken
}

// ---------- 文本分块 ----------

/** 句末标点（含空格）作为优先切分边界 */
const SOFT_BOUNDARY_CHARS = /[\s。！？；.!?]/
/** 未闭合的 XML 实体（如 &amp;）不能从中间切开 */
const ENTITY_START_CHAR = "&"
const ENTITY_END_CHAR = ";"

function alignToCodePointBoundary(text: string, index: number): number {
  if (index <= 0 || index >= text.length) return index
  const prev = text.charCodeAt(index - 1)
  const curr = text.charCodeAt(index)
  // 避免把代理对（emoji 等）切开
  if (prev >= 0xd800 && prev <= 0xdbff && curr >= 0xdc00 && curr <= 0xdfff) {
    return index - 1
  }
  return index
}

/** 二分查找字节上限内最大可切长度（UTF-8 字节） */
function findLargestSliceByBytes(text: string, maxBytes: number): number {
  let low = 1
  let high = text.length
  let best = 0
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const safe = alignToCodePointBoundary(text, middle)
    if (measureBytes(text.slice(0, safe)) <= maxBytes) {
      best = safe
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return alignToCodePointBoundary(text, best)
}

/** 尽量回退到最近的句末标点，避免句子被拦腰截断 */
function adjustToSoftBoundary(text: string, candidate: number): number {
  if (candidate >= text.length) return candidate
  const floor = Math.max(1, Math.floor(candidate * 0.6))
  for (let i = candidate; i >= floor; i--) {
    if (SOFT_BOUNDARY_CHARS.test(text[i - 1] ?? "")) return i
  }
  return candidate
}

/** 避免切断未闭合的 XML 实体 */
function adjustToEntityBoundary(text: string, candidate: number): number {
  if (candidate <= 0 || candidate >= text.length) return candidate
  const left = text.slice(0, candidate)
  const ampIndex = left.lastIndexOf(ENTITY_START_CHAR)
  if (ampIndex === -1) return candidate
  if (left.indexOf(ENTITY_END_CHAR, ampIndex) !== -1) return candidate
  if (text.indexOf(ENTITY_END_CHAR, candidate) !== -1) return ampIndex
  return candidate
}

export function splitTextIntoChunks(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const chunks: string[] = []
  let remaining = trimmed
  while (remaining.length > 0) {
    let splitAt = findLargestSliceByBytes(remaining, MAX_CHUNK_BYTES)
    if (splitAt <= 0) return []
    splitAt = adjustToSoftBoundary(remaining, splitAt)
    splitAt = adjustToEntityBoundary(remaining, splitAt)
    if (splitAt <= 0) splitAt = findLargestSliceByBytes(remaining, MAX_CHUNK_BYTES)

    const chunk = remaining.slice(0, splitAt).trim()
    if (!chunk) return []
    chunks.push(chunk)
    if (chunks.length > MAX_CHUNKS) return []
    remaining = remaining.slice(splitAt).trim()
  }
  return chunks
}

// ---------- SSML 与合成 ----------

/** 语速倍率转 SSML 百分比：1 → "+0%"，2 → "+100%"，0.5 → "-50%" */
function rateToSsmlPercent(rate: number): string {
  const percent = Math.round((rate - 1) * 100)
  if (percent === 0) return "+0%"
  return percent > 0 ? `+${percent}%` : `${percent}%`
}

function buildSsml(text: string, voice: string, rate: number): string {
  const cleanText = sanitizeText(text).trim()
  const locale = voice.split("-").slice(0, 2).join("-") || "en-US"
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escapeXml(locale)}">` +
    `<voice name="${escapeXml(voice)}">` +
    `<prosody rate="${escapeXml(rateToSsmlPercent(rate))}" pitch="+0Hz" volume="+0%">` +
    `${escapeXml(cleanText)}</prosody></voice></speak>`
  )
}

async function synthesizeChunk(chunk: string, voice: string, rate: number): Promise<ArrayBuffer> {
  let tokenInfo: EndpointToken
  try {
    tokenInfo = await getEndpointToken()
  } catch (error) {
    // 过期缓存兜底重用一次
    if (cachedToken && Date.now() < cachedToken.expiredAt) {
      tokenInfo = cachedToken
    } else {
      throw error
    }
  }

  const url = `https://${tokenInfo.region}.tts.speech.microsoft.com/cognitiveservices/v1`
  const doFetch = (authToken: string) =>
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: authToken,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": OUTPUT_FORMAT
      },
      body: buildSsml(chunk, voice, rate),
      signal: AbortSignal.timeout(SYNTH_TIMEOUT_MS)
    })

  let response = await doFetch(tokenInfo.token)

  // token 失效：清缓存换新 token 重试一次
  if (response.status === 401 || response.status === 403) {
    clearEdgeTtsTokenCache()
    tokenInfo = await getEndpointToken()
    response = await doFetch(tokenInfo.token)
  }

  if (!response.ok) {
    throw new Error(`synthesize ${response.status}`)
  }

  return response.arrayBuffer()
}

/**
 * 将文本合成为 MP3 音频（base64）。
 * 长文本会按句切分逐块合成后拼接（MP3 帧可直接拼接）。
 */
export async function synthesizeEdgeTts(text: string, voice: string, rate: number): Promise<EdgeTtsSynthesizeResult> {
  const chunks = splitTextIntoChunks(text)
  if (chunks.length === 0) {
    throw new Error("empty text")
  }

  const buffers: ArrayBuffer[] = []
  let total = 0
  for (const chunk of chunks) {
    const audio = await synthesizeChunk(chunk, voice, rate)
    buffers.push(audio)
    total += audio.byteLength
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const buffer of buffers) {
    merged.set(new Uint8Array(buffer), offset)
    offset += buffer.byteLength
  }

  return {
    audioBase64: arrayBufferToBase64(merged.buffer),
    contentType: CONTENT_TYPE
  }
}

// 仅供测试/诊断使用
export const EDGE_TTS_DEBUG = Object.freeze({ TRUSTED_CLIENT_TOKEN, ENDPOINT_URL, OUTPUT_FORMAT })
