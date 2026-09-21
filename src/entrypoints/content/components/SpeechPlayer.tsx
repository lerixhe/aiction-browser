import { useContext, useRef, useState } from "react"

import type { useSpeechPlayer } from "@/entrypoints/content/hooks/useSpeechPlayer"
import { IslandHoldContext } from "@/entrypoints/content/components/DynamicIsland"
import { EDGE_TTS_VOICE_GROUPS, isKnownEdgeTtsVoice } from "@/shared/edge-tts-voices"
import { useI18n } from "@/shared/i18n/context"
import { useUiTheme } from "@/shared/ui/theme"
import { uiMotion, uiRadius, uiSpace, uiTypography } from "@/shared/ui/tokens"

type SpeechPlayerInstance = ReturnType<typeof useSpeechPlayer>

const PROGRESS_STEPS = 1000
const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

/** TTS 动画关键帧（keyframes 在 shadow root 内全局生效；两个控制条都输出，保证任意挂载场景下动画可用） */
const TTS_ANIMATION_CSS = `
  @keyframes speech-wave {
    0%, 100% { transform: scaleY(0.35); }
    50% { transform: scaleY(1); }
  }
  @keyframes speech-spin {
    to { transform: rotate(360deg); }
  }
`

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
function WaveBars({ color, barHeight = 12 }: { color: string; barHeight?: number }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 2, height: barHeight + 2 }} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            width: 3,
            height: barHeight,
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

/** 按播放状态取胶囊图标 */
function useTtsStatusIcon(player: SpeechPlayerInstance) {
  const theme = useUiTheme()
  const { state } = player
  if (state.status === "loading") return <Spinner color={theme.brand.primary} />
  if (state.status === "failed") return <AlertGlyph color={theme.state.error} />
  if (state.status === "finished") return <DoneGlyph color={theme.state.success} />
  if (state.status === "paused") return <PauseGlyph size={12} color={theme.brand.primary} />
  return <WaveBars color={theme.brand.primary} />
}

/** 按播放状态取胶囊文案 */
function useTtsStatusLabel(player: SpeechPlayerInstance) {
  const { t } = useI18n()
  const { state } = player
  switch (state.status) {
    case "loading":
      return t("ui.tts.preparing")
    case "failed":
      return t("ui.tts.failed")
    case "finished":
      return t("ui.tts.finished")
    case "paused":
      return t("ui.tts.paused")
    default:
      return t("ui.tts.speaking")
  }
}

/**
 * 灵动岛胶囊态的 TTS 状态内容（图标 + 文案）。
 * mini 模式只显示图标，用于与聊天状态同岛分区显示。
 */
export function TtsPillContent({ player, mini = false }: { player: SpeechPlayerInstance; mini?: boolean }) {
  const theme = useUiTheme()
  const { t } = useI18n()
  const { state } = player
  const label = useTtsStatusLabel(player)
  const failed = state.status === "failed"
  const finished = state.status === "finished"

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }} aria-label={label}>
      {useTtsStatusIcon(player)}
      {!mini && (
        <span
          style={{
            fontSize: 12,
            fontWeight: uiTypography.fontWeight.medium,
            color: failed ? theme.state.error : finished ? theme.state.success : theme.text.primary
          }}>
          {label}
        </span>
      )}
    </div>
  )
}

/** 灵动岛展开态的 TTS 完整控制条 */
export function TtsControlBar({ player }: { player: SpeechPlayerInstance }) {
  const { state } = player
  const theme = useUiTheme()
  const { t } = useI18n()
  const islandHold = useContext(IslandHoldContext)
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const dragRatioRef = useRef<number | null>(null)

  const isEdge = state.engine === "edge"
  const isPlaying = state.status === "playing"
  const isLoading = state.status === "loading"
  const isFinished = state.status === "finished"

  const commitSeek = () => {
    const ratio = dragRatioRef.current
    if (ratio == null) return
    dragRatioRef.current = null
    setDragRatio(null)
    islandHold?.release()
    player.seekRatio(ratio)
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

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "0 10px",
        height: "100%"
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
          // 拖动中鼠标可能移出岛：hold 抑制自动收回，commitSeek/onBlur 时 release
          if (dragRatioRef.current == null) islandHold?.hold()
          const ratio = Number(e.target.value) / PROGRESS_STEPS
          dragRatioRef.current = ratio
          setDragRatio(ratio)
        }}
        onPointerUp={commitSeek}
        onKeyUp={commitSeek}
        onBlur={() => {
          if (dragRatioRef.current != null) islandHold?.release()
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

      <style>{`
        ${TTS_ANIMATION_CSS}
        .aiction-speech-iconbtn:hover:not(:disabled) {
          background: ${theme.bg.surfaceMuted};
        }
      `}</style>
    </div>
  )
}

/**
 * 聊天面板展开时内嵌的 TTS 迷你控制条（次要任务不喧宾夺主）：
 * 状态图标 + 时间 + 细进度条 + 播放/暂停 + 停止
 */
export function TtsMiniBar({ player }: { player: SpeechPlayerInstance }) {
  const { state } = player
  const theme = useUiTheme()
  const { t } = useI18n()

  const isEdge = state.engine === "edge"
  const isPlaying = state.status === "playing"
  const isLoading = state.status === "loading"

  const timeStyle = {
    fontSize: 10,
    color: theme.text.secondary,
    fontVariantNumeric: "tabular-nums" as const,
    userSelect: "none" as const,
    flexShrink: 0
  }

  const iconBtnStyle = {
    width: 20,
    height: 20,
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

  return (
    <div
      data-aiction-tts-minibar="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: uiSpace[8],
        padding: `${uiSpace[4]}px ${uiSpace[12]}px`,
        borderBottom: `0.5px solid ${theme.border.hairline}`,
        background: theme.bg.surfaceAlt,
        flexShrink: 0
      }}>
      {isLoading ? (
        <Spinner color={theme.brand.primary} />
      ) : isPlaying ? (
        <WaveBars color={theme.brand.primary} barHeight={9} />
      ) : state.status === "failed" ? (
        <AlertGlyph size={12} color={theme.state.error} />
      ) : state.status === "finished" ? (
        <DoneGlyph size={12} color={theme.state.success} />
      ) : (
        <PauseGlyph size={12} color={theme.brand.primary} />
      )}

      <span style={timeStyle}>{isEdge ? formatTime(state.currentTime) : `${state.chunkIndex}/${state.chunkCount}`}</span>

      <div
        style={{
          flex: 1,
          height: 3,
          borderRadius: 2,
          background: theme.bg.surfaceMuted,
          overflow: "hidden",
          minWidth: 0
        }}>
        <div
          style={{
            width: `${Math.round(state.progress * 100)}%`,
            height: "100%",
            background: theme.brand.primary,
            transition: `width 200ms linear`
          }}
        />
      </div>

      <span style={timeStyle}>{isEdge ? formatTime(state.duration) : ""}</span>

      <button
        type="button"
        aria-label={state.status === "paused" ? t("ui.tts.play") : t("ui.tts.pause")}
        title={state.status === "paused" ? t("ui.tts.play") : t("ui.tts.pause")}
        className="aiction-tts-mini-iconbtn"
        onClick={() => player.togglePause()}
        disabled={isLoading}
        style={{ ...iconBtnStyle, opacity: isLoading ? 0.4 : 1 }}>
        {isPlaying ? <PauseGlyph size={11} color={theme.brand.primary} /> : <PlayGlyph size={11} color={theme.brand.primary} />}
      </button>

      <button
        type="button"
        aria-label={t("ui.tts.stop")}
        title={t("ui.tts.stop")}
        className="aiction-tts-mini-iconbtn"
        onClick={() => player.stop()}
        style={iconBtnStyle}>
        <StopGlyph size={10} color={theme.text.secondary} />
      </button>

      <style>{`
        ${TTS_ANIMATION_CSS}
        .aiction-tts-mini-iconbtn:hover:not(:disabled) {
          background: ${theme.bg.surfaceMuted};
        }
      `}</style>
    </div>
  )
}
