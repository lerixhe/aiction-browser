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
  /** 发起过的授权页 URL（断言 PKCE 参数） */
  webAuthFlowCalls: string[]
  /** `AUTH_CHANGED` 广播（断言快照确实分发出去） */
  broadcasts: unknown[]
  /**
   * 设定「用户点了登录」之后授权页的返回：
   * - 字符串 = 回跳 URL
   * - 函数 = 用授权页 URL 现算回跳（测试可以从 URL 里取出随机 state）
   * - `undefined` = 用户关窗
   * - `"error"` = 通过 `runtime.lastError` 表达（部分 Chrome 版本的真实表现）
   */
  setWebAuthFlow: (result: string | undefined | "error" | ((authorizeUrl: string) => string | undefined)) => void
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
  const runtimeId = opts.runtimeId ?? "stub-extension-id"
  const webAuthFlowCalls: string[] = []
  const broadcasts: unknown[] = []

  let flowResult: string | undefined | "error" | ((authorizeUrl: string) => string | undefined) = undefined
  let lastError: { message: string } | undefined

  const stub: StorageStub = {
    local: new Map(),
    session: opts.session === false ? null : new Map(),
    sync: new Map(),
    calls: { local: 0, session: 0, sync: 0 },
    webAuthFlowCalls,
    broadcasts,
    setWebAuthFlow: (result) => {
      flowResult = result
    }
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
      id: runtimeId,
      getManifest: () => ({ version: "0.0.0-test" }),
      /** 真实 Chrome 在回调执行期间可读；这里模拟同一时序 */
      get lastError() {
        return lastError
      },
      sendMessage: async (message: unknown) => {
        broadcasts.push(message)
        return undefined
      }
    },
    identity: {
      getRedirectURL: () => `https://${runtimeId}.chromiumapp.org/`,
      launchWebAuthFlow: (
        details: { url: string; interactive?: boolean },
        callback: (redirectUrl?: string) => void
      ) => {
        webAuthFlowCalls.push(details.url)
        const current = flowResult
        queueMicrotask(() => {
          if (current === "error") {
            lastError = { message: "The user did not approve access." }
            callback(undefined)
            lastError = undefined
            return
          }
          callback(typeof current === "function" ? current(details.url) : current)
        })
      }
    },
    storage: { local, sync, ...(session ? { session } : {}) }
  }

  return stub
}

export function uninstallChromeStub(): void {
  const globalWithChrome = globalThis as { chrome?: unknown }
  delete globalWithChrome.chrome
}
