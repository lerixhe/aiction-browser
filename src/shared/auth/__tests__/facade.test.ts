/**
 * 快照订阅（`facade.subscribeAuthSnapshot`）。
 *
 * 三条通道语义都必须钉死，因为它们决定「UI 什么时候会看到变化」：
 * 1. 写入 → 通知；
 * 2. 同版本 / 更旧版本（乱序投递）→ 丢弃；
 * 3. **删除 → 必须通知**（不是「更旧的状态」）。
 *
 * 第 3 条曾经被当成第 2 条处理：`storage.remove()` 的 `newValue` 是 `undefined`，
 * 回退成 `updatedAt: 0` 的兜底快照后被「旧版本丢弃」吃掉，已经打开的页面就卡在上一份登录态，
 * 直到用户手动刷新。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { signedOutSnapshot, subscribeAuthSnapshot } from "@/shared/auth/facade"
import { AUTH_STORAGE_KEYS } from "@/shared/auth/types"
import { installChromeStub, uninstallChromeStub, type StorageStub } from "./chrome-stub"

let stub: StorageStub
let received: ReturnType<typeof signedOutSnapshot>[]
let unsubscribe: (() => void) | null = null

beforeEach(() => {
  stub = installChromeStub()
  received = []
  unsubscribe = null
})

afterEach(() => {
  unsubscribe?.()
  uninstallChromeStub()
})

function subscribe(): void {
  unsubscribe = subscribeAuthSnapshot((snapshot) => received.push(snapshot))
}

/** 模拟 background 写快照 */
function written(snapshot: unknown) {
  return { [AUTH_STORAGE_KEYS.snapshot]: { oldValue: undefined, newValue: snapshot } }
}

const signedIn = (updatedAt: number) => ({
  state: "signed-in" as const,
  plan: "pro" as const,
  email: "u***@example.com",
  updatedAt
})

describe("subscribeAuthSnapshot", () => {
  it("写入快照 → 通知一次", () => {
    subscribe()
    stub.emitStorageChange(written(signedIn(1_000)))

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ state: "signed-in", plan: "pro" })
  })

  it("同版本重复投递（广播 + storage 双通道）→ 只通知一次", () => {
    subscribe()
    stub.emitStorageChange(written(signedIn(1_000)))
    stub.emitStorageChange(written(signedIn(1_000)))

    expect(received).toHaveLength(1)
  })

  it("乱序到达的旧版本 → 丢弃", () => {
    subscribe()
    stub.emitStorageChange(written(signedIn(2_000)))
    stub.emitStorageChange(written(signedIn(1_000)))

    expect(received.map((snapshot) => snapshot.updatedAt)).toEqual([2_000])
  })

  it("快照被删除 → 必须通知 signed-out（不能当成「旧版本」丢掉）", () => {
    subscribe()
    stub.emitStorageChange(written(signedIn(1_000)))
    stub.emitStorageChange({ [AUTH_STORAGE_KEYS.snapshot]: { oldValue: signedIn(1_000), newValue: undefined } })

    expect(received).toHaveLength(2)
    expect(received[1].state).toBe("signed-out")
    expect(received[1].plan).toBe("anonymous")
  })

  it("删除后仍能接收更新的快照（去重基准已复位）", () => {
    subscribe()
    stub.emitStorageChange(written(signedIn(5_000)))
    stub.emitStorageChange({ [AUTH_STORAGE_KEYS.snapshot]: { oldValue: signedIn(5_000), newValue: undefined } })
    // 删除之后 background 又写了一份登录快照：不能因为基准停在删除时刻而被吃掉
    stub.emitStorageChange(written(signedIn(1)))

    expect(received.map((snapshot) => snapshot.state)).toEqual(["signed-in", "signed-out", "signed-in"])
  })

  it("内容损坏（无法解析）也按删除处理", () => {
    subscribe()
    stub.emitStorageChange(written(signedIn(1_000)))
    stub.emitStorageChange(written("garbage"))

    expect(received.map((snapshot) => snapshot.state)).toEqual(["signed-in", "signed-out"])
  })

  it("非 local 区域 / 其它 key 的变化不触发", () => {
    subscribe()
    stub.emitStorageChange({ "aiction:settings": { newValue: {} } }, "sync")
    stub.emitStorageChange({ "aiction:settings": { newValue: {} } }, "local")

    expect(received).toHaveLength(0)
  })

  it("退订后不再回调", () => {
    subscribe()
    unsubscribe?.()
    unsubscribe = null
    stub.emitStorageChange(written(signedIn(1_000)))

    expect(received).toHaveLength(0)
  })
})
