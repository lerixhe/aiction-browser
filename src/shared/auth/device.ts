/**
 * 匿名设备 token（契约 §3.1，SPEC §6.4）。
 *
 * 为什么需要它：没有登录的用户也要有一个**可识别、可限流、可撤销**的主体。
 * 只按 IP + 扩展 id 限流的话，重装 / 换网络就能绕过；device token 把匿名态也变成了
 * 服务端可管理的会话（这也是选 B 方案（PKCE + Bearer）而不是 cookie 的核心理由之一）。
 *
 * 失败一律**静默降级**为「没有官方服务」：匿名用户可能只是网络抖动，
 * 不该因此弹错或上报失败——`null` 让上层回落到 BYOK 即可。
 */
import { getAnonymousId } from "@/shared/anonymous-id"
import { DEVICE_RENEW_BUFFER_MS, PLATFORM } from "@/shared/auth/config"
import { toAuthError } from "@/shared/auth/errors"
import { authFetch } from "@/shared/auth/request"
import { readDeviceToken, clearDeviceToken, writeDeviceToken } from "@/shared/auth/storage"

interface DeviceTokenResponse {
  access_token?: string
  expires_in?: number
}

function extensionId(): string {
  try {
    return typeof chrome !== "undefined" ? chrome.runtime.id : ""
  } catch {
    return ""
  }
}

/**
 * 取一个可用的 device token：
 * 1. 本地有且剩余有效期 > 7 天 → 直接用（提前续签窗口，避免临界失败）；
 * 2. 否则 `POST /auth/device` 换新的，写入 `aiction:auth.deviceToken`；
 * 3. 429 / 网络 / 5xx → `null`（静默降级，不弹错、不上报失败埋点）。
 *
 * 幂等：服务端按 `device_id` + `ext_id` 复用同一主体，所以重复调用不会产生新主体。
 *
 * `force: true` 越过本地缓存（令牌被判无效时的救援路径）：先清掉旧 token 再领，
 * 避免「读到的还是那张坏令牌」把自己锁在 401 里。
 */
export async function ensureDeviceToken(options: { force?: boolean } = {}): Promise<string | null> {
  if (options.force) {
    await clearDeviceToken()
  } else {
    const cached = await readDeviceToken()
    if (cached && cached.expiresAt - Date.now() > DEVICE_RENEW_BUFFER_MS) {
      return cached.token
    }
  }

  const deviceId = await getAnonymousId()

  try {
    const response = await authFetch("/auth/device", {
      auth: false,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId, ext_id: extensionId(), platform: PLATFORM })
    })

    const data = (await response.json()) as DeviceTokenResponse
    const token = data.access_token
    if (!token) return null

    // `expires_in` 是契约必填项。缺了就**不写缓存**：按 0 写会落一条「立刻过期」的假缓存，
    // 每次冷启动都重打 /auth/device（幂等，但白花一次往返），而且把服务端字段缺失藏了起来。
    const expiresIn = typeof data.expires_in === "number" && data.expires_in > 0 ? data.expires_in : null
    if (expiresIn === null) {
      console.warn("[auth] /auth/device 响应缺少 expires_in，本次不缓存 device token")
    } else {
      await writeDeviceToken({ token, expiresAt: Date.now() + expiresIn * 1000 })
    }
    return token
  } catch (error) {
    const authError = toAuthError(error)

    // 「暂时不行」的三类 ─ 静默降级为 null，保留会话语义（本来也没有会话），下次再试：
    // 429 频控 / 网络失败 / 5xx 服务端抖动。
    // 4xx（如 400 invalid_request）说明是客户端 bug，**必须抛出来**，否则请求体写错永远发现不了。
    if (authError.code === "RATE_LIMITED" || authError.code === "NETWORK") {
      return null
    }
    if (authError.status !== undefined && authError.status >= 500) {
      return null
    }
    throw authError
  }
}
