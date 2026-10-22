/**
 * 存储挑起用的 `chrome.storage` 桩。
 *
 * 只实现被 `shared/auth/storage.ts` 用到的三件事：`get` / `set` / `remove`。
 * `sync` 也提供，是为了断言「**凭据从不写 sync**」——这个断言比任何注释都可靠。
 */
export interface StorageStub {
  local: Map<string, unknown>
  session: Map<string, unknown> | null
  sync: Map<string, unknown>
  /** 各区域的 set 调用次数，用于断言写入落点 */
  calls: { local: number; session: number; sync: number }
}
function createArea(map: Map<string, unknown>, onSet: () => void) {
  return {
    get: async (key: string) => (map.has(key) ? { [key]: map.get(key) } : {}),
    set: async (items: Record<string, unknown>) => {
      onSet()
      for (const [key, value] of Object.entries(items)) map.set(key, value)
    },
    remove: async (key: string) => {
      map.delete(key)
    }
  }
}

/** 安装桩，返回可控句柄；`session: false` 模拟不支持 `storage.session` 的旧浏览器 */
export function installChromeStub(opts: { session?: boolean; runtimeId?: string } = {}): StorageStub {
  const stub: StorageStub = {
    local: new Map(),
    session: opts.session === false ? null : new Map(),
    sync: new Map(),
    calls: { local: 0, session: 0, sync: 0 }
  }

  const local = createArea(stub.local, () => {
    stub.calls.local++
  })
  const sync = createArea(stub.sync, () => {
    stub.calls.sync++
  })
  const session = stub.session
    ? createArea(stub.session, () => {
        stub.calls.session++
      })
    : undefined

  const globalWithChrome = globalThis as { chrome?: unknown }
  globalWithChrome.chrome = {
    runtime: {
      id: opts.runtimeId ?? "stub-extension-id",
      getManifest: () => ({ version: "0.0.0-test" })
    },
    storage: { local, sync, ...(session ? { session } : {}) }
  }

  return stub
}

export function uninstallChromeStub(): void {
  const globalWithChrome = globalThis as { chrome?: unknown }
  delete globalWithChrome.chrome
}
