/**
 * 认证存储的落地规则（SPEC §4 / §12.1 U-存储 系列）。
 *
 * 重点断言三件事：
 * 1. **分层**：access token 进 `storage.session`，refresh token 进 `storage.local`；
 * 2. **损坏自愈**：解析不了就当作没有，并把坏 key 删掉（不抛错、不留垃圾）；
 * 3. **永不进 sync**（凭据会跨设备同步的路径一律不开）。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  clearAccess,
  clearSession,
  readAccess,
  readPersisted,
  readSession,
  readSnapshot,
  writeAccess,
  writePersisted,
  writeSession,
  writeSnapshot
} from "@/shared/auth/storage"
import { AUTH_STORAGE_KEYS } from "@/shared/auth/types"
import { installChromeStub, uninstallChromeStub, type StorageStub } from "./chrome-stub"

let stub: StorageStub

const persisted = { userId: "u-1", plan: "pro" as const, refreshToken: "refresh-1" }
const access = { accessToken: "access-1", accessTokenExpiresAt: Date.now() + 3600_000, userId: "u-1", plan: "pro" as const }

beforeEach(() => {
  stub = installChromeStub()
})

afterEach(() => {
  uninstallChromeStub()
})

describe("分层落盘", () => {
  it("writeAccess 落 storage.session，不落 local", async () => {
    await writeAccess(access)

    expect(stub.session?.get(AUTH_STORAGE_KEYS.access)).toMatchObject({ accessToken: "access-1" })
    expect(stub.local.has(AUTH_STORAGE_KEYS.access)).toBe(false)
    expect(stub.calls.session).toBe(1)
    expect(stub.calls.local).toBe(0)
  })

  it("writePersisted 落 storage.local", async () => {
    await writePersisted(persisted)

    expect(stub.local.get(AUTH_STORAGE_KEYS.persisted)).toMatchObject({ refreshToken: "refresh-1" })
  })

  it("writeSession 同时写两层，readSession 合并回完整会话", async () => {
    await writeSession({ ...persisted, ...access })

    expect(stub.session?.has(AUTH_STORAGE_KEYS.access)).toBe(true)
    expect(stub.local.has(AUTH_STORAGE_KEYS.persisted)).toBe(true)

    const session = await readSession()
    expect(session).toMatchObject({
      userId: "u-1",
      plan: "pro",
      refreshToken: "refresh-1",
      accessToken: "access-1"
    })
  })

  it("只有持久层、没有 access 时 readSession 返回 null（缺一层就算无会话）", async () => {
    await writePersisted(persisted)
    expect(await readSession()).toBeNull()
  })

  it("clearSession 清两层，clearAccess 只清 access", async () => {
    await writeSession({ ...persisted, ...access })
    await clearAccess()

    expect(await readAccess()).toBeNull()
    expect(await readPersisted()).not.toBeNull()

    await writeSession({ ...persisted, ...access })
    await clearSession()
    expect(await readPersisted()).toBeNull()
    expect(await readAccess()).toBeNull()
  })

  it("任何写入都不碰 storage.sync", async () => {
    await writeSession({ ...persisted, ...access })
    await writeSnapshot({ state: "signed-in", plan: "pro", updatedAt: 1 })

    expect(stub.calls.sync).toBe(0)
    expect(stub.sync.size).toBe(0)
  })
})

describe("storage.session 不可用时降级", () => {
  beforeEach(() => {
    uninstallChromeStub()
    stub = installChromeStub({ session: false })
  })

  it("access token 落到 local，并带降级标记；读回仍可用", async () => {
    await writeAccess(access)

    const raw = stub.local.get(AUTH_STORAGE_KEYS.access) as Record<string, unknown>
    expect(raw.accessToken).toBe("access-1")
    expect(raw._degraded).toBe(true)

    expect(await readAccess()).toMatchObject({ accessToken: "access-1" })
  })
})

describe("损坏自愈", () => {
  it("持久层缺 refreshToken → 视为无会话，删 key 与快照", async () => {
    stub.local.set(AUTH_STORAGE_KEYS.persisted, { userId: "u-1", plan: "pro" })
    stub.local.set(AUTH_STORAGE_KEYS.snapshot, { state: "signed-in", plan: "pro", updatedAt: 1 })

    expect(await readPersisted()).toBeNull()
    expect(stub.local.has(AUTH_STORAGE_KEYS.persisted)).toBe(false)
    expect(stub.local.has(AUTH_STORAGE_KEYS.snapshot)).toBe(false)
  })

  it("plan 不在枚举内 → 判为损坏", async () => {
    stub.local.set(AUTH_STORAGE_KEYS.persisted, { userId: "u-1", plan: "enterprise", refreshToken: "r" })
    expect(await readPersisted()).toBeNull()
  })

  it("access 过期时间不是数字 → 判为损坏并删除", async () => {
    stub.session?.set(AUTH_STORAGE_KEYS.access, { accessToken: "a", accessTokenExpiresAt: "soon", userId: "u-1", plan: "pro" })
    expect(await readAccess()).toBeNull()
    expect(stub.session?.has(AUTH_STORAGE_KEYS.access)).toBe(false)
  })

  it("快照 state 非法 → null 并清 key", async () => {
    stub.local.set(AUTH_STORAGE_KEYS.snapshot, { state: "logged-in", plan: "pro", updatedAt: 1 })
    expect(await readSnapshot()).toBeNull()
    expect(stub.local.has(AUTH_STORAGE_KEYS.snapshot)).toBe(false)
  })

  it("storage 抛错时不向外抛（扩展上下文失效场景）", async () => {
    const throwing = {
      get: async () => {
        throw new Error("Extension context invalidated")
      }
    }
    ;(globalThis as { chrome?: { storage: { local: unknown; session: unknown } } }).chrome = {
      storage: { local: throwing, session: throwing }
    }

    await expect(readPersisted()).resolves.toBeNull()
    await expect(readAccess()).resolves.toBeNull()
    await expect(readSnapshot()).resolves.toBeNull()
  })

  it("chrome 未定义时所有读返回 null，不抛错", async () => {
    uninstallChromeStub()
    expect(await readPersisted()).toBeNull()
    expect(await readAccess()).toBeNull()
    expect(await readSnapshot()).toBeNull()
  })
})
