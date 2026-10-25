/**
 * 用量曲线（`GET /v1/me/usage`，契约 §4.2）。
 *
 * 只给 Options 账号页画图用。刻意**不参与任何判断**（不用于放行、不用于引导升级）：
 * 额度真值在 `/v1/me`，曲线是「这几天花了多少」的展示数据。
 *
 * `from` / `to` 不传，交给服务端取「本周期起点 → 今天」：客户端算日期会踩时区，
 * 而服务端本来就以订阅周期为口径。
 */
import { USAGE_TTL_MS } from "@/shared/auth/config"
import { apiJson } from "@/shared/auth/request"
import type { UsagePoint, UsageSeries } from "@/shared/auth/types"

let cache: { value: UsageSeries; at: number } | null = null
let inflight: Promise<UsageSeries | null> | null = null

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0
}

function parsePoint(raw: unknown): UsagePoint | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const date = typeof record.date === "string" ? record.date.trim() : ""
  if (!date) return null
  return {
    date,
    inTokens: num(record.in_tokens),
    outTokens: num(record.out_tokens),
    requests: num(record.requests)
  }
}

/** 解析 `/v1/me/usage`。`points` 不是数组 → `null`（结构不对，不拿空图冒充「零用量」） */
export function parseUsageSeries(raw: unknown): UsageSeries | null {
  if (!raw || typeof raw !== "object") return null
  const points = (raw as Record<string, unknown>).points
  if (!Array.isArray(points)) return null

  return {
    points: points
      .map(parsePoint)
      .filter((point): point is UsagePoint => point !== null)
      // 日期是 `YYYY-MM-DD`，字典序即时间序；服务端顺序不稳定时图表不会锯齿
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    granularity: "day"
  }
}

async function fetchUsage(): Promise<UsageSeries | null> {
  try {
    const raw = await apiJson<unknown>("/v1/me/usage?granularity=day")
    const parsed = parseUsageSeries(raw)
    if (!parsed) return null
    cache = { value: parsed, at: Date.now() }
    return parsed
  } catch {
    return null
  }
}

/** 取用量曲线（`force` 越过 60s TTL；`null` = 这次没拿到） */
export async function getUsageSeries(options: { force?: boolean } = {}): Promise<UsageSeries | null> {
  if (!options.force && cache && Date.now() - cache.at < USAGE_TTL_MS) return cache.value
  if (inflight) return inflight

  inflight = fetchUsage().finally(() => {
    inflight = null
  })
  return inflight
}

export function clearUsageCache(): void {
  cache = null
}

/** 曲线最高点（画坐标轴用）；空集返回 0 */
export function peakTokens(points: UsagePoint[]): number {
  return points.reduce((peak, point) => Math.max(peak, point.inTokens + point.outTokens), 0)
}
