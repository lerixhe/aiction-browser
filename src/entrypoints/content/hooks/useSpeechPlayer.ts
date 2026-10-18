import { useCallback, useEffect, useRef, useState } from "react"

import { MESSAGE_TYPES } from "@/shared/constants"
import { detectTextLocale, resolveVoiceForText } from "@/shared/edge-tts-voices"
import { getSettings, saveSettings } from "@/shared/storage"
import { trackEvent, lengthBucket, type AnalyticsSource } from "@/shared/analytics"
import type { TtsSettings, TtsSynthesizeResponse } from "@/shared/types"

const MAX_UTTERANCE_LENGTH = 180

export type SpeechStatus = "idle" | "loading" | "playing" | "paused" | "finished" | "failed"
export type SpeechEngine = "system" | "edge"

/** 系统语音单段长度上限（分句后按长度合并，避免超长 utterance 失败） */
function splitText(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) return []

  const sentences = normalized.match(/[^。！？.!?]+[。！？.!?]?/g) || [normalized]
  const chunks: string[] = []
  let current = ""

  for (const sentence of sentences) {
    if (current.length + sentence.length > MAX_UTTERANCE_LENGTH) {
      if (current) chunks.push(current)
      current = sentence
    } else {
      current += sentence
    }
  }

  if (current) chunks.push(current)
  return chunks
}

interface SpeechSession {
  text: string
  engine: SpeechEngine
  /** 实际使用的 Edge 语音名（system 引擎为空串） */
  voice: string
  rate: number
  /** 系统语音使用的 BCP-47 语言 */
  lang: string
  /** 系统语音分句结果 */
  chunks: string[]
  /** 系统语音当前播放的句下标（0-based） */
  chunkCursor: number
}

export interface SpeechPlayerState {
  status: SpeechStatus
  engine: SpeechEngine
  voice: string
  rate: number
  /** 播放进度 0–1 */
  progress: number
  /** Edge 音频当前时间（秒） */
  currentTime: number
  /** Edge 音频总时长（秒） */
  duration: number
  /** 系统语音当前句（1-based） */
  chunkIndex: number
  /** 系统语音总句数 */
  chunkCount: number
}

const INITIAL_STATE: SpeechPlayerState = {
  status: "idle",
  engine: "edge",
  voice: "",
  rate: 1,
  progress: 0,
  currentTime: 0,
  duration: 0,
  chunkIndex: 0,
  chunkCount: 0
}

/**
 * 朗读播放器状态机（content script）。
 *
 * - 统一管理系统语音（speechSynthesis 分句播放）与 Edge 在线语音（background 合成 + <audio>）
 * - 向 SpeechPlayer 组件（悬浮朗读控件）暴露播放/暂停/进度/语音/语速控制
 * - 播放结束进入 finished 常驻态，控件不自动消失，由用户手动关闭（stop）或闲置退场
 * - 播放中调整语音或语速时，Edge 引擎按当前进度比例重新合成并续播；
 *   finished 态下则从头播放；系统语音从当前句按新参数续播（句级粒度）
 * - 用户在控制条的调整会写回设置（edgeVoice / rate），作为之后的默认值
 */
export function useSpeechPlayer(source: AnalyticsSource = "web") {
  const [state, setState] = useState<SpeechPlayerState>(INITIAL_STATE)

  const statusRef = useRef<SpeechStatus>("idle")
  const sessionRef = useRef<SpeechSession | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  /** 会话代数：start/stop/seek/change 后 +1，旧的异步回调据此自我丢弃，避免竞态 */
  const generationRef = useRef(0)
  /** 本次朗读的开始时刻（用于 speech_finished 的 duration_ms） */
  const sessionStartedAtRef = useRef<number | null>(null)
  /** 本次朗读是否已上报过终态（自然播完 / 中途关闭只算一次） */
  const finishReportedRef = useRef(false)

  const patchState = useCallback((patch: Partial<SpeechPlayerState>) => {
    if (patch.status !== undefined) statusRef.current = patch.status
    setState((prev) => ({ ...prev, ...patch }))
  }, [])

  const clearAudio = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.onended = null
    audio.onerror = null
    audio.ontimeupdate = null
    audio.onloadedmetadata = null
    audioRef.current = null
  }, [])

  /** 推进会话代数并停止所有播放（旧的异步回调据此自我丢弃）；返回新代数供后续回调校验 */
  const cancelPlayback = useCallback((): number => {
    const generation = ++generationRef.current
    try {
      window.speechSynthesis?.cancel()
    } catch {
      // 个别环境下 speechSynthesis 访问会抛错
    }
    clearAudio()
    return generation
  }, [clearAudio])

  // 组件卸载时停止所有播放
  useEffect(() => {
    return () => {
      generationRef.current += 1
      try {
        window.speechSynthesis?.cancel()
      } catch {
        // ignore
      }
      clearAudio()
    }
  }, [clearAudio])

  /** 朗读终局上报（自然播完 / 中途关闭），每次朗读只报一次；只报结构特征，不报文本 */
  const reportSpeechEnd = useCallback(
    (session: SpeechSession, interrupted: boolean) => {
      if (finishReportedRef.current) return
      finishReportedRef.current = true
      void trackEvent("speech_finished", {
        source,
        provider: session.engine,
        char_count_bucket: lengthBucket(session.text.length),
        rate: session.rate,
        interrupted,
        duration_ms: sessionStartedAtRef.current !== null ? Math.round(Date.now() - sessionStartedAtRef.current) : 0
      })
    },
    [source]
  )

  // ---------- 设置写回 ----------

  const persistTts = useCallback(async (patch: Partial<TtsSettings>) => {
    try {
      const settings = await getSettings()
      await saveSettings({ ...settings, tts: { ...settings.tts, ...patch } })
    } catch {
      // 扩展上下文失效等场景忽略
    }
  }, [])

  // ---------- 系统语音 ----------

  /** 播放结束：进入 finished 常驻态（控件不自动消失，进度打满） */
  const finish = useCallback(() => {
    const session = sessionRef.current
    if (session) {
      reportSpeechEnd(session, false)
    }
    if (session && session.engine === "edge") {
      const audio = audioRef.current
      const duration = audio && Number.isFinite(audio.duration) ? audio.duration : 0
      patchState({ status: "finished", progress: 1, currentTime: duration, duration })
    } else if (session) {
      patchState({ status: "finished", progress: 1, chunkIndex: session.chunks.length })
    } else {
      patchState({ status: "finished" })
    }
  }, [patchState, reportSpeechEnd])

  /** 从第 startIndex 句开始播放系统语音（调用方需已 cancel 并推进 generation） */
  const speakFrom = useCallback(
    (session: SpeechSession, startIndex: number, generation: number) => {
      const synth = window.speechSynthesis
      if (!synth) {
        patchState({ status: "failed" })
        return
      }
      if (startIndex >= session.chunks.length) {
        finish()
        return
      }

      session.chunkCursor = startIndex
      patchState({
        status: "playing",
        chunkIndex: startIndex + 1,
        progress: (startIndex + 0.5) / session.chunks.length
      })

      const speakNext = (index: number) => {
        if (generationRef.current !== generation) return
        if (index >= session.chunks.length) {
          finish()
          return
        }
        session.chunkCursor = index
        patchState({
          chunkIndex: index + 1,
          progress: (index + 0.5) / session.chunks.length
        })

        const utterance = new SpeechSynthesisUtterance(session.chunks[index])
        utterance.lang = session.lang
        utterance.rate = session.rate
        utterance.onend = () => {
          if (generationRef.current !== generation) return
          speakNext(index + 1)
        }
        utterance.onerror = () => {
          // cancel 触发的中断已被 generation 过滤，能走到这里的是真实错误（如无可用语音）
          if (generationRef.current !== generation) return
          patchState({ status: "failed" })
        }
        synth.speak(utterance)
      }

      speakNext(startIndex)
    },
    [finish, patchState]
  )

  // ---------- Edge 在线语音 ----------

  /** 播放合成好的 base64 音频；resumeRatio > 0 时按比例跳转到对应位置续播 */
  const playEdgeAudio = useCallback(
    (audioBase64: string, contentType: string, resumeRatio: number, generation: number) => {
      clearAudio()
      const audio = new Audio(`data:${contentType || "audio/mpeg"};base64,${audioBase64}`)
      audioRef.current = audio

      audio.ontimeupdate = () => {
        if (generationRef.current !== generation) return
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0
        patchState({
          currentTime: audio.currentTime,
          duration,
          progress: duration > 0 ? Math.min(1, audio.currentTime / duration) : 0
        })
      }
      audio.onended = () => {
        if (generationRef.current !== generation) return
        finish()
      }
      audio.onerror = () => {
        if (generationRef.current !== generation) return
        patchState({ status: "failed" })
      }

      const startPlayback = () => {
        if (generationRef.current !== generation) return
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0
        if (resumeRatio > 0 && duration > 0) {
          audio.currentTime = Math.max(0, Math.min(resumeRatio * duration, duration - 0.05))
        }
        patchState({
          status: "playing",
          duration,
          currentTime: audio.currentTime,
          progress: duration > 0 ? Math.min(1, audio.currentTime / duration) : 0
        })
        void audio.play().catch(() => {
          if (generationRef.current !== generation) return
          patchState({ status: "failed" })
        })
      }

      audio.onloadedmetadata = () => {
        audio.onloadedmetadata = null
        startPlayback()
      }
      audio.load()
    },
    [clearAudio, finish, patchState]
  )

  /** 用 Edge 引擎合成并播放；失败返回 false（由调用方决定降级） */
  const startEdge = useCallback(
    async (session: SpeechSession, resumeRatio: number, generation: number): Promise<boolean> => {
      patchState({
        status: "loading",
        engine: "edge",
        voice: session.voice,
        rate: session.rate,
        progress: 0,
        currentTime: 0,
        duration: 0
      })

      try {
        const response = (await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.TTS_SYNTHESIZE_REQUEST,
          payload: { text: session.text, voice: session.voice, rate: session.rate }
        })) as TtsSynthesizeResponse | undefined

        if (generationRef.current !== generation) return false
        if (!response?.success || !response.audioBase64) {
          throw new Error(response?.error || "no audio returned")
        }

        playEdgeAudio(response.audioBase64, response.contentType || "audio/mpeg", resumeRatio, generation)
        return true
      } catch (error) {
        if (generationRef.current !== generation) return false
        console.warn("[AIction] Edge TTS failed:", error)
        return false
      }
    },
    [patchState, playEdgeAudio]
  )

  // ---------- 对外 API ----------

  /** 开始朗读一段文本（悬浮控件由 App 锚定到工具栏落位，这里无定位逻辑） */
  const start = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const generation = cancelPlayback()

      void (async () => {
        const settings = await getSettings()
        if (generationRef.current !== generation) return

        const tts = settings.tts
        const chunks = splitText(trimmed)
        const lang = detectTextLocale(trimmed) ?? (navigator.language || "zh-CN")
        const voice =
          tts.provider === "edge"
            ? tts.autoLocale
              ? resolveVoiceForText(trimmed, tts.edgeVoice)
              : tts.edgeVoice
            : ""

        const session: SpeechSession = {
          text: trimmed,
          engine: tts.provider,
          voice,
          rate: tts.rate,
          lang,
          chunks,
          chunkCursor: 0
        }
        sessionRef.current = session
        sessionStartedAtRef.current = Date.now()
        finishReportedRef.current = false

        void trackEvent("speech_started", {
          source,
          // 请求的引擎（edge 合成失败会降级到 system，降级会体现在 edge_tts_synthesize 的 success:false 上）
          provider: tts.provider,
          char_count_bucket: lengthBucket(trimmed.length),
          rate: tts.rate,
          chunk_count: chunks.length
        })

        patchState({
          engine: tts.provider,
          voice,
          rate: tts.rate,
          progress: 0,
          currentTime: 0,
          duration: 0,
          chunkIndex: 0,
          chunkCount: chunks.length
        })

        if (tts.provider === "edge") {
          const ok = await startEdge(session, 0, generation)
          if (generationRef.current !== generation) return
          if (!ok) {
            // 在线合成失败（如无网络）时降级到系统语音
            session.engine = "system"
            patchState({ engine: "system" })
            speakFrom(session, 0, generation)
          }
        } else {
          speakFrom(session, 0, generation)
        }
      })()
    },
    [cancelPlayback, patchState, speakFrom, startEdge, source]
  )

  /** 停止播放并关闭朗读控件 */
  const stop = useCallback(() => {
    const session = sessionRef.current
    // 还没播完就被关掉：与自然播完（finish）区分开，两者共用 speech_finished
    if (session && !finishReportedRef.current) {
      reportSpeechEnd(session, true)
    }
    cancelPlayback()
    sessionRef.current = null
    sessionStartedAtRef.current = null
    finishReportedRef.current = false
    patchState({ status: "idle", progress: 0, currentTime: 0, duration: 0, chunkIndex: 0 })
  }, [cancelPlayback, patchState, reportSpeechEnd])

  /** 播放/暂停切换；finished 状态下重新开始播放 */
  const togglePause = useCallback(() => {
    const session = sessionRef.current
    if (!session) return

    if (statusRef.current === "finished") {
      if (session.engine === "edge") {
        // ended 的音频直接 play() 会从头（或 seek 后位置）重新播放
        const audio = audioRef.current
        if (audio) {
          void audio
            .play()
            .then(() => patchState({ status: "playing" }))
            .catch(() => {})
        }
      } else {
        speakFrom(session, 0, cancelPlayback())
      }
      return
    }

    if (statusRef.current === "playing") {
      if (session.engine === "edge") audioRef.current?.pause()
      else window.speechSynthesis?.pause()
      patchState({ status: "paused" })
    } else if (statusRef.current === "paused") {
      if (session.engine === "edge") {
        void audioRef.current?.play().catch(() => {})
      } else {
        window.speechSynthesis?.resume()
      }
      patchState({ status: "playing" })
    }
  }, [cancelPlayback, patchState, speakFrom])

  /** 当前播放进度比例（换语音/语速后续播用）；finished 态返回 0，重新合成后从头播放 */
  const currentRatio = useCallback((): number => {
    if (statusRef.current === "finished") return 0
    const session = sessionRef.current
    if (!session) return 0
    if (session.engine === "edge") {
      const audio = audioRef.current
      if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
        return Math.min(1, audio.currentTime / audio.duration)
      }
      return 0
    }
    if (session.chunks.length === 0) return 0
    return Math.min(1, (session.chunkCursor + 0.5) / session.chunks.length)
  }, [])

  /** 拖动进度：Edge 精确 seek；系统语音按比例跳到最近的句子（近似）。
   *  finished 状态下 Edge 仅定位（按播放键继续），系统语音从该句直接播放。 */
  const seekRatio = useCallback(
    (ratio: number) => {
      const session = sessionRef.current
      if (!session) return
      const status = statusRef.current
      if (status !== "playing" && status !== "paused" && status !== "finished") return
      const clamped = Math.min(1, Math.max(0, ratio))

      if (session.engine === "edge") {
        const audio = audioRef.current
        if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
          audio.currentTime = Math.max(0, Math.min(clamped * audio.duration, audio.duration - 0.05))
          patchState({ currentTime: audio.currentTime, progress: clamped })
        }
        return
      }

      const generation = cancelPlayback()
      const index = Math.min(session.chunks.length - 1, Math.floor(clamped * session.chunks.length))
      speakFrom(session, index, generation)
    },
    [cancelPlayback, patchState, speakFrom]
  )

  /** 播放中切换语音（仅 Edge）：按当前进度重新合成并续播 */
  const changeVoice = useCallback(
    (voice: string) => {
      const session = sessionRef.current
      const trimmed = voice.trim()
      if (!session || session.engine !== "edge" || !trimmed) return

      session.voice = trimmed
      patchState({ voice: trimmed })

      const resumeRatio = currentRatio()
      const generation = cancelPlayback()

      void startEdge(session, resumeRatio, generation).then((ok) => {
        if (ok) void persistTts({ edgeVoice: trimmed })
      })
    },
    [cancelPlayback, currentRatio, patchState, persistTts, startEdge]
  )

  /** 播放中切换语速：Edge 按当前进度重新合成并续播；系统语音从当前句重播 */
  const changeRate = useCallback(
    (rate: number) => {
      const session = sessionRef.current
      if (!session || !Number.isFinite(rate)) return
      const clamped = Math.min(2, Math.max(0.5, rate))
      session.rate = clamped
      patchState({ rate: clamped })

      if (session.engine === "edge") {
        const resumeRatio = currentRatio()
        const generation = cancelPlayback()
        void startEdge(session, resumeRatio, generation).then((ok) => {
          if (ok) void persistTts({ rate: clamped })
        })
        return
      }

      const generation = cancelPlayback()
      speakFrom(session, session.chunkCursor, generation)
      void persistTts({ rate: clamped })
    },
    [cancelPlayback, currentRatio, patchState, persistTts, speakFrom, startEdge]
  )

  return { state, start, stop, togglePause, seekRatio, changeVoice, changeRate }
}
