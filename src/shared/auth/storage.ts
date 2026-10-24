/**
 * 认证存储：分两层落地（SPEC §4）。
 *
 * | 层 | 区域 | 内容 | 为什么在这一格 |
 * |---|---|---|---|
 * | 短期 | `storage.session` → `aiction:auth.session` | `accessToken` / `accessTokenExpiresAt` | 默认 access level = `TRUSTED_CONTEXTS`，content script **技术上**读不到（Chrome 强制） |
 * | 长期 | `storage.local` → `aiction:auth` | `refreshToken` / `userId` / `plan` | SW 随时休眠，必须落盘；local 的隔离只能靠代码纪律 + 边界检查脚本 |
 *
 * 两条硬规则：
 * 1. **绝不进 `storage.sync`**（会跨设备同步）。
 * 2. 任何读取失败都**不抛错**：解析不了就视为「无此数据」并删掉坏 key（§4.4 损坏自愈）。
 *    扩展上下文失效期间所有 storage 调用都可能 reject，抛错会把整条会话链路带崩。
 *
 * ⚠️ 本模块只在 background 内使用（content / pdf-viewer 禁止 import，见 `scripts/check-auth-boundary.ts`）。
 */
import type { AccessCredential, AuthSession, AuthSnapshot, PendingAuth, PersistedAuth } from "@/shared/auth/types"
import { AUTH_STORAGE_KEYS, isPlanId, parseAuthSnapshot } from "@/shared/auth/types"

/** 降级标记：`storage.session` 不可用时写进 local 副本，回读时有据可查（SPEC §4.3） */
const DEGRADED_FLAG = "_degraded"

// ── 底层读写 ────────────────────────────────────────────────

function hasStorage(): boolean {
  // `typeof` 判定必不可少：可选链挡不住「变量未声明」的 ReferenceError
  return typeof chrome !== "undefined" && Boolean(chrome.storage)
}

/**
 * access token 该落在哪个区域。
 * - `storage.session` 可用（Chrome 102+ / Firefox 115+）→ 正常隔离；
 * - 不可用 → 降级到 local（**功能不降级，隔离降级**，写入时带 `_degraded` 标记）。
 */
function accessStore(): { area: chrome.storage.StorageArea; degraded: boolean } | null {
  if (!hasStorage()) return null
  try {
    const session = chrome.storage.session
    if (session) return { area: session, degraded: false }
  } catch {
    // 旧浏览器访问 chrome.storage.session 可能直接抛
  }
  return { area: chrome.storage.local, degraded: true }
}

async function readRaw(area: chrome.storage.StorageArea, key: string): Promise<unknown> {
  try {
    const result = await area.get(key)
    return result?.[key]
  } catch {
    return undefined
  }
}

async function writeRaw(area: chrome.storage.StorageArea, key: string, value: unknown): Promise<void> {
  try {
    await area.set({ [key]: value })
  } catch {
    // 扩展上下文失效 / 配额满：写入失败不抛，由上层「读不到 = 无会话」兜底
  }
}

async function removeRaw(area: chrome.storage.StorageArea, key: string): Promise<void> {
  try {
    await area.remove(key)
  } catch {
    // 同上
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

// ── 解析（含损坏自愈）───────────────────────────────────────

function parsePersisted(raw: unknown): PersistedAuth | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  if (!isNonEmptyString(record.refreshToken) || !isNonEmptyString(record.userId) || !isPlanId(record.plan)) {
    return null
  }
  return { userId: record.userId, plan: record.plan, refreshToken: record.refreshToken }
}

function parseAccess(raw: unknown): AccessCredential | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  if (
    !isNonEmptyString(record.accessToken) ||
    !isFiniteNumber(record.accessTokenExpiresAt) ||
    !isNonEmptyString(record.userId) ||
    !isPlanId(record.plan)
  ) {
    return null
  }
  return {
    accessToken: record.accessToken,
    accessTokenExpiresAt: record.accessTokenExpiresAt,
    userId: record.userId,
    plan: record.plan
  }
}

function parseSnapshot(raw: unknown): AuthSnapshot | null {
  return parseAuthSnapshot(raw)
}

function parsePending(raw: unknown): PendingAuth | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  if (!isNonEmptyString(record.state) || !isNonEmptyString(record.verifier) || !isFiniteNumber(record.createdAt)) {
    return null
  }
  return { state: record.state, verifier: record.verifier, createdAt: record.createdAt }
}

function parseDeviceToken(raw: unknown): { token: string; expiresAt: number } | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  if (!isNonEmptyString(record.token) || !isFiniteNumber(record.expiresAt)) return null
  return { token: record.token, expiresAt: record.expiresAt }
}

// ── access 层（短期）────────────────────────────────────────

export async function readAccess(): Promise<AccessCredential | null> {
  const store = accessStore()
  if (!store) return null
  const raw = await readRaw(store.area, AUTH_STORAGE_KEYS.access)
  const parsed = parseAccess(raw)
  if (!parsed && raw !== undefined) {
    // 损坏：删掉，交由上层用 refresh token 重新换一批
    await removeRaw(store.area, AUTH_STORAGE_KEYS.access)
  }
  return parsed
}

export async function writeAccess(value: AccessCredential): Promise<void> {
  const store = accessStore()
  if (!store) return
  await writeRaw(store.area, AUTH_STORAGE_KEYS.access, store.degraded ? { ...value, [DEGRADED_FLAG]: true } : value)
}

/** 只清 access（identity 对不上、token 被判失效但会话仍可救时用） */
export async function clearAccess(): Promise<void> {
  const store = accessStore()
  if (store) await removeRaw(store.area, AUTH_STORAGE_KEYS.access)
  // 降级副本可能存在于上一次运行（session 从不可用变为可用的升级场景），顺手清掉
  if (hasStorage()) await removeRaw(chrome.storage.local, AUTH_STORAGE_KEYS.access)
}

// ── 持久层（长期）──────────────────────────────────────────

/** 只有 refresh token 的那一半。冷启动（session 已被浏览器清空）靠它续命 */
export async function readPersisted(): Promise<PersistedAuth | null> {
  if (!hasStorage()) return null
  const raw = await readRaw(chrome.storage.local, AUTH_STORAGE_KEYS.persisted)
  const parsed = parsePersisted(raw)
  if (!parsed && raw !== undefined) {
    await removeRaw(chrome.storage.local, AUTH_STORAGE_KEYS.persisted)
    await clearSnapshot()
  }
  return parsed
}

export async function writePersisted(value: PersistedAuth): Promise<void> {
  if (!hasStorage()) return
  await writeRaw(chrome.storage.local, AUTH_STORAGE_KEYS.persisted, value)
}

// ── 两层合并后的会话 ────────────────────────────────────────

/** 完整会话 = 持久层 + access 层，缺任一层都返回 null */
export async function readSession(): Promise<AuthSession | null> {
  const persisted = await readPersisted()
  if (!persisted) return null
  const access = await readAccess()
  if (!access) return null
  return {
    userId: persisted.userId,
    plan: persisted.plan,
    refreshToken: persisted.refreshToken,
    accessToken: access.accessToken,
    accessTokenExpiresAt: access.accessTokenExpiresAt
  }
}

/** 同时写两层 */
export async function writeSession(value: AuthSession): Promise<void> {
  await writePersisted({ userId: value.userId, plan: value.plan, refreshToken: value.refreshToken })
  await writeAccess({
    accessToken: value.accessToken,
    accessTokenExpiresAt: value.accessTokenExpiresAt,
    userId: value.userId,
    plan: value.plan
  })
}

/** 清两层：这是「会话不存在了」的唯一表达（登出 / refresh 被撤销） */
export async function clearSession(): Promise<void> {
  if (hasStorage()) await removeRaw(chrome.storage.local, AUTH_STORAGE_KEYS.persisted)
  await clearAccess()
}

// ── 快照层（跨上下文只读）──────────────────────────────────

export async function readSnapshot(): Promise<AuthSnapshot | null> {
  if (!hasStorage()) return null
  const raw = await readRaw(chrome.storage.local, AUTH_STORAGE_KEYS.snapshot)
  const parsed = parseSnapshot(raw)
  if (!parsed && raw !== undefined) {
    await removeRaw(chrome.storage.local, AUTH_STORAGE_KEYS.snapshot)
  }
  return parsed
}

export async function writeSnapshot(value: AuthSnapshot): Promise<void> {
  if (!hasStorage()) return
  await writeRaw(chrome.storage.local, AUTH_STORAGE_KEYS.snapshot, value)
}

export async function clearSnapshot(): Promise<void> {
  if (!hasStorage()) return
  await removeRaw(chrome.storage.local, AUTH_STORAGE_KEYS.snapshot)
}

// ── 登录挂起态（一次性）────────────────────────────────────

export async function readPending(): Promise<PendingAuth | null> {
  if (!hasStorage()) return null
  const raw = await readRaw(chrome.storage.local, AUTH_STORAGE_KEYS.pending)
  const parsed = parsePending(raw)
  if (!parsed && raw !== undefined) {
    await removeRaw(chrome.storage.local, AUTH_STORAGE_KEYS.pending)
  }
  return parsed
}

export async function writePending(value: PendingAuth): Promise<void> {
  if (!hasStorage()) return
  await writeRaw(chrome.storage.local, AUTH_STORAGE_KEYS.pending, value)
}

export async function clearPending(): Promise<void> {
  if (!hasStorage()) return
  await removeRaw(chrome.storage.local, AUTH_STORAGE_KEYS.pending)
}

// ── 设备 token（匿名主体）──────────────────────────────────

export async function readDeviceToken(): Promise<{ token: string; expiresAt: number } | null> {
  if (!hasStorage()) return null
  const raw = await readRaw(chrome.storage.local, AUTH_STORAGE_KEYS.deviceToken)
  const parsed = parseDeviceToken(raw)
  if (!parsed && raw !== undefined) {
    await removeRaw(chrome.storage.local, AUTH_STORAGE_KEYS.deviceToken)
  }
  return parsed
}

export async function writeDeviceToken(value: { token: string; expiresAt: number }): Promise<void> {
  if (!hasStorage()) return
  await writeRaw(chrome.storage.local, AUTH_STORAGE_KEYS.deviceToken, value)
}

/**
 * 清掉匿名主体（device token 被判无效时用）。
 * 清空后 `ensureDeviceToken()` 会重新向 `/auth/device` 领一张——契约 §3.1 是幂等的，
 * 同 `device_id` + `ext_id` 复用同一主体，所以不会把用户的匿名额度「换个号」。
 */
export async function clearDeviceToken(): Promise<void> {
  if (!hasStorage()) return
  await removeRaw(chrome.storage.local, AUTH_STORAGE_KEYS.deviceToken)
}
