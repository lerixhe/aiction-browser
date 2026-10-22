/**
 * fetch 桩（认证相关单测共用）。
 *
 * 按**调用顺序**返回响应：认证流程的顺序是确定的（token → /v1/me → refresh），
 * 用顺序比用 URL 路由更能暴露「多打了一次 / 少打了一次」这类问题——而那正是要测的。
 */
export type FetchCall = { url: string; init: RequestInit }

export function installFetchStub(factories: Array<() => Response | Promise<Response>>): FetchCall[] {
  const calls: FetchCall[] = []
  let index = 0
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    const factory = factories[Math.min(index, factories.length - 1)]
    index++
    return factory()
  }) as unknown as typeof fetch
  return calls
}

export function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

export function unauthorized(code?: string): Response {
  return jsonResponse(401, code ? { error: { code, message: "nope" } } : { error: { message: "no code" } })
}

/** 让挂起中的 await 链推进一轮（fetch 桩是异步的，断言前需要） */
export function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
