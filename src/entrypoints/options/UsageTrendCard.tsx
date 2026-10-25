/**
 * 用量趋势（M3，契约 §4.2）。
 *
 * 纯展示：不参与放行、不用来引导升级（额度真值在 `/v1/me`）。
 * 曲线用内联 SVG 而不是引入图表库——这里只需要两条折线，而任何图表库都会给
 * Options 的包体加几十 KB（`AGENTS.md` 的记录：包体每加一档都要重新评估）。
 */
import { useEffect, useState } from "react"

import type { UsagePoint, UsageResponse, UsageSeries } from "@/shared/auth/types"
import { MESSAGE_TYPES } from "@/shared/constants"
import { useI18n } from "@/shared/i18n/context"
import { Button, SectionCard, Skeleton } from "./ui"

const MSG = MESSAGE_TYPES

/** 只画最近 N 天：更长的窗口在 100×40 的坐标系里会糊成一片 */
const MAX_POINTS = 30

const CHART_WIDTH = 100
const CHART_HEIGHT = 40

function compact(value: number): string {
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}K`
  return `${(value / 1_000_000).toFixed(1)}M`
}

/**
 * 折线路径。
 *
 * 单点时画不出线（`M` 之后没有 `L`），所以复制成一条水平直线——
 * 「只有一天数据」是真实场景（刚注册的用户），不能渲染成空白图。
 */
function linePath(values: number[], peak: number): string {
  if (values.length === 0) return ""
  const safePeak = peak > 0 ? peak : 1
  const x = (index: number): number =>
    values.length === 1 ? 0 : (index / (values.length - 1)) * CHART_WIDTH
  const y = (value: number): number => CHART_HEIGHT - (value / safePeak) * CHART_HEIGHT

  if (values.length === 1) {
    return `M 0 ${y(values[0])} L ${CHART_WIDTH} ${y(values[0])}`
  }
  return values.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ")
}

function peakOf(points: UsagePoint[]): number {
  return points.reduce((peak, point) => Math.max(peak, point.inTokens + point.outTokens), 0)
}

export function UsageTrendCard({ enabled }: { enabled: boolean }) {
  const { t } = useI18n()
  const [series, setSeries] = useState<UsageSeries | null>(null)
  const [loaded, setLoaded] = useState(false)
  /** 拉取失败时允许重试（与套餐卡同一个理由：后台未就绪时不能只能靠重开页面自愈） */
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setSeries(null)
      setLoaded(false)
      return
    }

    let alive = true
    setLoaded(false)
    void (async () => {
      try {
        const response = (await chrome.runtime.sendMessage({
          type: MSG.USAGE_REQUEST
        })) as UsageResponse | undefined
        if (!alive) return
        setSeries(response?.usage ?? null)
      } catch {
        if (alive) setSeries(null)
      } finally {
        if (alive) setLoaded(true)
      }
    })()

    return () => {
      alive = false
    }
  }, [enabled, attempt])

  // 未登录且没有匿名主体：没有用量可看，整张卡不出现（不是画一张空表）
  if (!enabled) return null

  const points = (series?.points ?? []).slice(-MAX_POINTS)
  const peak = peakOf(points)
  const totalIn = points.reduce((sum, point) => sum + point.inTokens, 0)
  const totalOut = points.reduce((sum, point) => sum + point.outTokens, 0)

  return (
    <SectionCard title={t("options.account.usageTrendTitle")} description={t("options.account.usageTrendDesc")}>
      {!loaded ? (
        <Skeleton style={{ width: "100%", height: 120 }} />
      ) : !series ? (
        <div className="opt-plans-empty">
          <span>{t("options.account.usageTrendUnavailable")}</span>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            {t("options.account.retry")}
          </Button>
        </div>
      ) : points.length === 0 ? (
        <div className="opt-usage-meta">{t("options.account.usageTrendEmpty")}</div>
      ) : (
        <div className="opt-trend">
          <div className="opt-trend-legend">
            <span className="opt-trend-key">
              <i className="opt-trend-dot opt-trend-dot--in" />
              {t("options.account.usageTrendLegendIn")}
              <b>{compact(totalIn)}</b>
            </span>
            <span className="opt-trend-key">
              <i className="opt-trend-dot opt-trend-dot--out" />
              {t("options.account.usageTrendLegendOut")}
              <b>{compact(totalOut)}</b>
            </span>
            <span className="opt-trend-range">
              {points[0].date} → {points[points.length - 1].date}
            </span>
          </div>

          <svg
            className="opt-trend-chart"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={t("options.account.usageTrendTitle")}>
            {/* 基线：让「零用量」也能看出这是一张图而不是空白 */}
            <line className="opt-trend-axis" x1="0" y1={CHART_HEIGHT} x2={CHART_WIDTH} y2={CHART_HEIGHT} />
            <path
              className="opt-trend-line opt-trend-line--in"
              d={linePath(
                points.map((point) => point.inTokens),
                peak
              )}
              vectorEffect="non-scaling-stroke"
            />
            <path
              className="opt-trend-line opt-trend-line--out"
              d={linePath(
                points.map((point) => point.outTokens),
                peak
              )}
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <div className="opt-usage-meta">
            <span>{t("options.account.usageTrendPeak", [compact(peak)])}</span>
            <span>
              {t("options.account.usageTrendRequests", [
                String(points.reduce((sum, point) => sum + point.requests, 0))
              ])}
            </span>
          </div>
        </div>
      )}
    </SectionCard>
  )
}
