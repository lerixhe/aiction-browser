import { useContext, useRef, useState } from "react"

import type { useSpeechPlayer } from "@/entrypoints/content/hooks/useSpeechPlayer"
import { HoldContext } from "@/entrypoints/content/components/SpeechWidget"
import { EDGE_TTS_VOICE_GROUPS, isKnownEdgeTtsVoice } from "@/shared/edge-tts-voices"
import { useI18n } from "@/shared/i18n/context"
import { useUiTheme } from "@/shared/ui/theme"
import { uiRadius, uiTypography } from "@/shared/ui/tokens"

type SpeechPlayerInstance = ReturnType<typeof useSpeechPlayer>

const PROGRESS_STEPS = 1000
const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
/** 播放完毕后闲置退场等待时长（与 SpeechWidget 的计时器保持一致） */
const TTS_DISMISS_MS = 5000

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

/** 悬浮控件圆球态的内容（迷你状态图标） */
export function TtsCircleContent({ player }: { player: SpeechPlayerInstance }) {
  const theme = useUiTheme()
  const { state } = player

  if (state.status === "loading") return <Spinner color={theme.brand.primary} />
  if (state.status === "failed") return <AlertGlyph size={13} color={theme.state.error} />
  if (state.status === "finished") return <DoneGlyph size={13} color={theme.state.success} />
  if (state.status === "paused") return <PauseGlyph size={12} color={theme.brand.primary} />
  return <WaveBars color={theme.brand.primary} barHeight={9} />
}

/** 朗读退场倒计时圆环：铺满 32px 圆球边缘，5s 内从满环收到零（linear）。
 *  挂载/卸载由 coordinator 的 ttsDismissCounting 驱动，与退场 setTimeout 同帧启停——
 *  悬停/展开时环与计时器一起暂停，移开后一起从头重计。 */
export function TtsCountdownRing() {
  const theme = useUiTheme()
  // 球直径 32，环内缩贴边：r=14.5 + stroke 2 → 外缘 15 < 16（留 1px 不被 overflow 裁）
  const r = 14.5
  const c = 2 * Math.PI * r
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none"
      }}>
      <style>{`
        @keyframes tts-countdown {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: ${c}; }
        }
      `}</style>
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        style={{ display: "block", transform: "rotate(-90deg)" }}>
        {/* 轨道 */}
        <circle cx="16" cy="16" r={r} fill="none" stroke={theme.border.default} strokeWidth="2" opacity="0.6" />
        {/* 进度：满环 → 无（倒计时归零时退场动画接管） */}
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          stroke={theme.brand.primary}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={0}
          style={{
            animation: `tts-countdown ${TTS_DISMISS_MS}ms linear forwards`
          }}
        />
      </svg>
    </div>
  )
}

/** 朗读悬浮控件展开态的完整控制条 */
export function TtsControlBar({ player }: { player: SpeechPlayerInstance }) {
  const { state } = player
  const theme = useUiTheme()
  const { t } = useI18n()
  const hold = useContext(HoldContext)
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
    hold?.release()
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
          // 拖动中鼠标可能移出控件：hold 抑制自动收起，commitSeek/onBlur 时 release
          if (dragRatioRef.current == null) hold?.hold()
          const ratio = Number(e.target.value) / PROGRESS_STEPS
          dragRatioRef.current = ratio
          setDragRatio(ratio)
        }}
        onPointerUp={commitSeek}
        onKeyUp={commitSeek}
        onBlur={() => {
          if (dragRatioRef.current != null) hold?.release()
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
