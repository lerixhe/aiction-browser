import { useCallback, useEffect, useRef, useState } from "react"

import type { useSpeechPlayer } from "@/entrypoints/content/hooks/useSpeechPlayer"
import { EDGE_TTS_VOICE_GROUPS, isKnownEdgeTtsVoice } from "@/shared/edge-tts-voices"
import { useI18n } from "@/shared/i18n/context"
import { useUiTheme } from "@/shared/ui/theme"
import { uiLayer, uiMotion, uiRadius, uiTypography } from "@/shared/ui/tokens"

type SpeechPlayerInstance = ReturnType<typeof useSpeechPlayer>

/** 灵动岛固定在页面顶部中央 */
const ISLAND_TOP = 12
const PILL_WIDTH = 104
const PILL_HEIGHT = 30
const BAR_WIDTH = 448
const BAR_HEIGHT = 44
/** 鼠标移出后自动收回的延迟 */
const COLLAPSE_DELAY_MS = 300
const PROGRESS_STEPS = 1000
const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

interface GlyphProps {
  size?: number
  color: string
}

function PlayGlyph({ size = 14, color }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ color }} aria-hidden="true">
      <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.86l10.4-6.86a1 1 0 0 0 0-1.72L9.56 4.28a1 1 0 0 0-1.56.86z" fill="currentColor" />
    </svg>
  )
}

function PauseGlyph({ size = 14, color }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ color }} aria-hidden="true">
      <rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" />
      <rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" />
    </svg>
  )
}

function StopGlyph({ size = 12, color }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ color }} aria-hidden="true">
      <rect x="5.5" y="5.5" width="13" height="13" rx="2" fill="currentColor" />
    </svg>
  )
}

function DoneGlyph({ size = 14, color }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color }}
      aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function AlertGlyph({ size = 14, color }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color }}
      aria-hidden="true">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

/** 播放中跳动的音柱动画 */
function WaveBars({ color }: { color: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 2, height: 14 }} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            width: 3,
            height: 12,
            borderRadius: 2,
            background: color,
            transformOrigin: "center",
            animation: `speech-wave 900ms ease-in-out ${i * 140}ms infinite`
          }}
        />
      ))}
    </span>
  )
}

function Spinner({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        border: `2px solid ${color}33`,
        borderTopColor: color,
        display: "inline-block",
        animation: "speech-spin 700ms linear infinite"
      }}
    />
  )
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00"
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${minutes}:${String(secs).padStart(2, "0")}`
}

interface Props {
  player: SpeechPlayerInstance
}

export default function SpeechPlayer({ player }: Props) {
  const { state } = player
  const theme = useUiTheme()
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const dragRatioRef = useRef<number | null>(null)
  /** 拖动进度时鼠标移出岛：等松手提交后再继续安排收缩 */
  const pendingCollapseRef = useRef(false)
  const collapseTimerRef = useRef<number | null>(null)

  const active = state.status !== "idle"

  // 停止/关闭后复位本地 UI 状态
  useEffect(() => {
    if (active) return
    setExpanded(false)
    setDragRatio(null)
    dragRatioRef.current = null
    pendingCollapseRef.current = false
    if (collapseTimerRef.current != null) {
      window.clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
  }, [active])

  const expand = useCallback(() => {
    pendingCollapseRef.current = false
    if (collapseTimerRef.current != null) {
      window.clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
    setExpanded(true)
  }, [])

  const scheduleCollapse = useCallback(() => {
    // 拖动进度条时鼠标可能移出岛，不能收缩；记下意图，松手后继续
    if (dragRatioRef.current != null) {
      pendingCollapseRef.current = true
      return
    }
    if (collapseTimerRef.current != null) return
    collapseTimerRef.current = window.setTimeout(() => {
      collapseTimerRef.current = null
      setExpanded(false)
    }, COLLAPSE_DELAY_MS)
  }, [])

  if (!active) return null

  const isEdge = state.engine === "edge"
  const isPlaying = state.status === "playing"
  const isLoading = state.status === "loading"
  const isFinished = state.status === "finished"
  const isFailed = state.status === "failed"

  // 与 SelectionToolbar 一致的表面阴影
  const surfaceShadow = (() => {
    const hex = theme.bg.page.replace("#", "")
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    const isDark = (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
    return isDark
      ? "0 8px 40px 0 rgb(0 0 0 / 0.28), 0 0 1px 0 rgb(0 0 0 / 0.28)"
      : "0 8px 40px 0 rgb(0 0 0 / 0.08), 0 0 1px 0 rgb(0 0 0 / 0.08)"
  })()

  const statusLabel = isLoading
    ? t("ui.tts.preparing")
    : isFailed
      ? t("ui.tts.failed")
      : isFinished
        ? t("ui.tts.finished")
        : state.status === "paused"
          ? t("ui.tts.paused")
          : t("ui.tts.speaking")

  const commitSeek = () => {
    const ratio = dragRatioRef.current
    if (ratio == null) return
    dragRatioRef.current = null
    setDragRatio(null)
    player.seekRatio(ratio)
    if (pendingCollapseRef.current) {
      pendingCollapseRef.current = false
      scheduleCollapse()
    }
  }

  const timeStyle = {
    fontSize: 11,
    color: theme.text.secondary,
    fontVariantNumeric: "tabular-nums" as const,
    minWidth: 30,
    textAlign: "center" as const,
    userSelect: "none" as const,
    flexShrink: 0
  }

  const iconBtnStyle = {
    width: 26,
    height: 26,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    color: theme.text.primary,
    borderRadius: uiRadius.pill,
    cursor: "pointer",
    padding: 0,
    flexShrink: 0
  }

  const selectStyle = {
    height: 26,
    padding: "0 4px",
    fontSize: 12,
    border: `1px solid ${theme.border.hairline}`,
    borderRadius: uiRadius.sm,
    background: theme.bg.surfaceAlt,
    color: theme.text.primary,
    outline: "none",
    cursor: isEdge ? "pointer" : "default",
    fontFamily: uiTypography.fontFamily,
    flexShrink: 0
  }

  const statusIcon = isLoading ? (
    <Spinner color={theme.brand.primary} />
  ) : isFailed ? (
    <AlertGlyph color={theme.state.error} />
  ) : isFinished ? (
    <DoneGlyph color={theme.state.success} />
  ) : state.status === "paused" ? (
    <PauseGlyph size={12} color={theme.brand.primary} />
  ) : (
    <WaveBars color={theme.brand.primary} />
  )

  return (
    <div
      data-aiction-speech-player="true"
      aria-label={statusLabel}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.preventDefault()
          event.stopPropagation()
          setExpanded(false)
        }
      }}
      onMouseEnter={expand}
      onMouseLeave={scheduleCollapse}
      style={{
        position: "fixed",
        top: ISLAND_TOP,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: uiLayer.overlay,
        width: expanded ? BAR_WIDTH : PILL_WIDTH,
        height: expanded ? BAR_HEIGHT : PILL_HEIGHT,
        borderRadius: uiRadius.pill,
        background: theme.bg.surface,
        border: `1px solid ${isFailed ? theme.state.error : theme.border.default}`,
        boxShadow: surfaceShadow,
        overflow: "hidden",
        pointerEvents: "auto",
        fontFamily: uiTypography.fontFamily,
        transition: `width 320ms ${uiMotion.easingSpring}, height 320ms ${uiMotion.easingSpring}, border-color ${uiMotion.durationFast} ${uiMotion.easingStandard}`,
        cursor: expanded ? "default" : "pointer"
      }}>
      {/* 折叠层：状态胶囊（灵动岛主体） */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          opacity: expanded ? 0 : 1,
          transition: `opacity 140ms ${uiMotion.easingStandard}`,
          pointerEvents: "none",
          whiteSpace: "nowrap"
        }}>
        {statusIcon}
        <span
          style={{
            fontSize: 12,
            fontWeight: uiTypography.fontWeight.medium,
            color: isFailed ? theme.state.error : isFinished ? theme.state.success : theme.text.primary
          }}>
          {statusLabel}
        </span>
      </div>

      {/* 展开层：播放控制条 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "0 10px",
          opacity: expanded ? 1 : 0,
          transform: expanded ? "scale(1)" : "scale(0.94)",
          transition: `opacity 180ms ${uiMotion.easingDecelerate} ${expanded ? 70 : 0}ms, transform 240ms ${uiMotion.easingSpring}`,
          pointerEvents: expanded ? "auto" : "none"
        }}>
        {/* 播放/暂停/重新播放 */}
        <button
          type="button"
          aria-label={isFinished || state.status === "paused" ? t("ui.tts.play") : t("ui.tts.pause")}
          title={isFinished || state.status === "paused" ? t("ui.tts.play") : t("ui.tts.pause")}
          className="aiction-speech-iconbtn"
          onClick={() => player.togglePause()}
          disabled={isLoading}
          style={{ ...iconBtnStyle, cursor: isLoading ? "default" : "pointer", opacity: isLoading ? 0.4 : 1 }}>
          {isPlaying ? <PauseGlyph color={theme.brand.primary} /> : <PlayGlyph color={theme.brand.primary} />}
        </button>

        {/* 进度：Edge 显示时间，系统语音显示句数 */}
        <span style={timeStyle}>{isEdge ? formatTime(state.currentTime) : state.chunkIndex}</span>
        <input
          type="range"
          min={0}
          max={PROGRESS_STEPS}
          step={1}
          aria-label={t("ui.tts.progress")}
          title={isEdge ? t("ui.tts.progress") : t("ui.tts.progressBySentence")}
          disabled={isLoading}
          value={Math.round((dragRatio ?? state.progress) * PROGRESS_STEPS)}
          onChange={(e) => {
            const ratio = Number(e.target.value) / PROGRESS_STEPS
            dragRatioRef.current = ratio
            setDragRatio(ratio)
          }}
          onPointerUp={commitSeek}
          onKeyUp={commitSeek}
          onBlur={() => {
            dragRatioRef.current = null
            setDragRatio(null)
          }}
          style={{ flex: 1, minWidth: 0, accentColor: theme.accent.primary, cursor: "pointer", margin: 0 }}
        />
        <span style={timeStyle}>{isEdge ? formatTime(state.duration) : `/ ${state.chunkCount}`}</span>

        <div style={{ width: 1, height: 18, background: theme.border.default, flexShrink: 0 }} />

        {/* 语音角色 */}
        <select
          value={isEdge ? state.voice : ""}
          disabled={!isEdge}
          aria-label={t("options.actions.tts.voice")}
          title={t("options.actions.tts.voice")}
          onChange={(e) => player.changeVoice(e.target.value)}
          style={{ ...selectStyle, width: 106 }}>
          {!isEdge && <option value="">{t("ui.tts.systemVoice")}</option>}
          {isEdge && !isKnownEdgeTtsVoice(state.voice) && <option value={state.voice}>{state.voice}</option>}
          {isEdge &&
            EDGE_TTS_VOICE_GROUPS.map((group) => (
              <optgroup key={group.locale} label={group.label}>
                {group.voices.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.label}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>

        {/* 语速 */}
        <select
          value={String(state.rate)}
          aria-label={t("options.actions.tts.rate")}
          title={t("options.actions.tts.rate")}
          onChange={(e) => player.changeRate(Number(e.target.value))}
          style={{ ...selectStyle, width: 56 }}>
          {RATE_OPTIONS.map((rate) => (
            <option key={rate} value={String(rate)}>
              {rate}x
            </option>
          ))}
        </select>

        {/* 停止/关闭 */}
        <button
          type="button"
          aria-label={t("ui.tts.stop")}
          title={t("ui.tts.stop")}
          className="aiction-speech-iconbtn"
          onClick={() => player.stop()}
          style={iconBtnStyle}>
          <StopGlyph color={theme.text.secondary} />
        </button>
      </div>

      <style>{`
        @keyframes speech-wave {
          0%, 100% { transform: scaleY(0.35); }
          50% { transform: scaleY(1); }
        }
        @keyframes speech-spin {
          to { transform: rotate(360deg); }
        }
        .aiction-speech-iconbtn:hover:not(:disabled) {
          background: ${theme.bg.surfaceMuted};
        }
      `}</style>
    </div>
  )
}
