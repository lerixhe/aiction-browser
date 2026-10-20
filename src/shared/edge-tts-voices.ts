// Edge 在线语音精选列表（按语言分组）
// 完整语音列表有 400+ 项，这里精选常用语音；用户仍可在设置中切换组内任意语音。

import { parseLocaleTag } from "@/shared/language-tag"

export interface EdgeTtsVoiceOption {
  /** 语音全名，如 "zh-CN-XiaoxiaoNeural"，直接用于 SSML */
  name: string
  /** 展示名：中文语音用中文名（女/男），其他语言用英文名 (F/M) */
  label: string
}

export interface EdgeTtsVoiceGroup {
  /** 语言标签，如 "zh-CN"，用于 i18n 匹配与排序 */
  locale: string
  /** 分组标题（下拉 optgroup），语音名保持原生语言 */
  label: string
  voices: EdgeTtsVoiceOption[]
}

export const EDGE_TTS_VOICE_GROUPS: EdgeTtsVoiceGroup[] = [
  {
    locale: "zh-CN",
    label: "中文（简体）",
    voices: [
      { name: "zh-CN-XiaoxiaoNeural", label: "晓晓（女）" },
      { name: "zh-CN-XiaoyiNeural", label: "晓伊（女）" },
      { name: "zh-CN-YunxiNeural", label: "云希（男）" },
      { name: "zh-CN-YunyangNeural", label: "云扬（男）" },
      { name: "zh-CN-YunjianNeural", label: "云健（男）" },
      { name: "zh-CN-YunxiaNeural", label: "云夏（男）" }
    ]
  },
  {
    locale: "zh-TW",
    label: "中文（繁体）",
    voices: [
      { name: "zh-TW-HsiaoChenNeural", label: "曉臻（女）" },
      { name: "zh-TW-YunJheNeural", label: "雲哲（男）" }
    ]
  },
  {
    locale: "zh-HK",
    label: "中文（粤语）",
    voices: [
      { name: "zh-HK-HiuMaanNeural", label: "曉曼（女）" },
      { name: "zh-HK-WanLungNeural", label: "雲龍（男）" }
    ]
  },
  {
    locale: "en-US",
    label: "English (US)",
    voices: [
      { name: "en-US-JennyNeural", label: "Jenny (F)" },
      { name: "en-US-AriaNeural", label: "Aria (F)" },
      { name: "en-US-MichelleNeural", label: "Michelle (F)" },
      { name: "en-US-DavisNeural", label: "Davis (M)" },
      { name: "en-US-GuyNeural", label: "Guy (M)" },
      { name: "en-US-TonyNeural", label: "Tony (M)" }
    ]
  },
  {
    locale: "en-GB",
    label: "English (UK)",
    voices: [
      { name: "en-GB-SoniaNeural", label: "Sonia (F)" },
      { name: "en-GB-LibbyNeural", label: "Libby (F)" },
      { name: "en-GB-RyanNeural", label: "Ryan (M)" }
    ]
  },
  {
    locale: "ja-JP",
    label: "日本語",
    voices: [
      { name: "ja-JP-NanamiNeural", label: "Nanami (F)" },
      { name: "ja-JP-KeitaNeural", label: "Keita (M)" }
    ]
  },
  {
    locale: "ko-KR",
    label: "한국어",
    voices: [
      { name: "ko-KR-SunHiNeural", label: "SunHi (F)" },
      { name: "ko-KR-InJoonNeural", label: "InJoon (M)" }
    ]
  },
  {
    locale: "de-DE",
    label: "Deutsch",
    voices: [
      { name: "de-DE-KatjaNeural", label: "Katja (F)" },
      { name: "de-DE-ConradNeural", label: "Conrad (M)" }
    ]
  },
  {
    locale: "fr-FR",
    label: "Français",
    voices: [
      { name: "fr-FR-DeniseNeural", label: "Denise (F)" },
      { name: "fr-FR-HenriNeural", label: "Henri (M)" }
    ]
  },
  {
    locale: "es-ES",
    label: "Español",
    voices: [
      { name: "es-ES-ElviraNeural", label: "Elvira (F)" },
      { name: "es-ES-AlvaroNeural", label: "Álvaro (M)" }
    ]
  },
  {
    locale: "ru-RU",
    label: "Русский",
    voices: [
      { name: "ru-RU-SvetlanaNeural", label: "Svetlana (F)" },
      { name: "ru-RU-DmitryNeural", label: "Dmitry (M)" }
    ]
  },
  {
    locale: "pt-BR",
    label: "Português (BR)",
    voices: [
      { name: "pt-BR-FranciscaNeural", label: "Francisca (F)" },
      { name: "pt-BR-AntonioNeural", label: "Antonio (M)" }
    ]
  },
  {
    locale: "it-IT",
    label: "Italiano",
    voices: [
      { name: "it-IT-ElsaNeural", label: "Elsa (F)" },
      { name: "it-IT-DiegoNeural", label: "Diego (M)" }
    ]
  },
  {
    locale: "ar-SA",
    label: "العربية",
    voices: [
      { name: "ar-SA-ZariyahNeural", label: "Zariyah (F)" },
      { name: "ar-SA-HamedNeural", label: "Hamed (M)" }
    ]
  },
  {
    locale: "hi-IN",
    label: "हिन्दी",
    voices: [
      { name: "hi-IN-SwaraNeural", label: "Swara (F)" },
      { name: "hi-IN-MadhurNeural", label: "Madhur (M)" }
    ]
  },
  {
    locale: "th-TH",
    label: "ไทย",
    voices: [
      { name: "th-TH-PremwadeeNeural", label: "Premwadee (F)" },
      { name: "th-TH-NiwatNeural", label: "Niwat (M)" }
    ]
  },
  {
    locale: "vi-VN",
    label: "Tiếng Việt",
    voices: [
      { name: "vi-VN-HoaiMyNeural", label: "HoaiMy (F)" },
      { name: "vi-VN-NamMinhNeural", label: "NamMinh (M)" }
    ]
  }
]

/** 判断给定语音是否在精选列表内 */
export function isKnownEdgeTtsVoice(name: string): boolean {
  return EDGE_TTS_VOICE_GROUPS.some((group) => group.voices.some((voice) => voice.name === name))
}

// ---------- 文本语言检测与语音解析 ----------

/** 检测到的语言 → 默认语音映射（自动匹配时使用） */
export const LOCALE_DEFAULT_VOICES: Record<string, string> = Object.fromEntries(
  EDGE_TTS_VOICE_GROUPS.map((group) => {
    // 每组取第一个（女声）作为默认
    return [group.locale, group.voices[0]?.name ?? ""]
  })
)

/** 粤语白话文专用字（含简繁两种写法），用字是封闭字符集 */
const CANTONESE_ONLY_CHARS = new Set([
  ...Array.from("嘅咗唔哋嗰喺冇攞佢諗乜嘢嚟搵揾倾傾偈咁啲噉嚿")
])

/**
 * 文本语言检测：主判断交给浏览器的 CLD（`chrome.i18n.detectLanguage`），
 * 不再用 Unicode 区段计数 / 变音符正则去猜语言。
 *
 * 保留的唯一规则是粤语：CLD 对粤语白话文只会返回 `zh` / `zh-Hant`，
 * 无法区分粤语与普通话/台湾国语，而粤语语音读普通话文本会非常难听，
 * 只能靠粤语专用字（封闭字符集）判定。
 *
 * 返回语音组 locale（如 "zh-CN" / "en-US"）；无法判定时返回 null（调用方自行兜底）。
 */
export async function detectTextLocale(text: string): Promise<string | null> {
  const sample = text.slice(0, 500).trim()
  if (!sample) return null

  if (containsCantoneseChar(sample)) return "zh-HK"

  const tag = await detectLanguageTag(sample)
  if (!tag) return null
  return matchVoiceLocale(tag)
}

/** 粤语专用字命中检测（逐码点查集合，不做模式匹配） */
function containsCantoneseChar(text: string): boolean {
  for (const char of text) {
    if (CANTONESE_ONLY_CHARS.has(char)) return true
  }
  return false
}

/**
 * 调用 CLD 取可信度最高的语言标签；
 * 无 chrome.i18n（测试/页面注入环境）、无结果或调用报错时返回 null，由调用方兜底。
 */
function detectLanguageTag(text: string): Promise<string | null> {
  if (typeof chrome === "undefined" || !chrome.i18n?.detectLanguage) return Promise.resolve(null)
  const { detectLanguage } = chrome.i18n

  return new Promise((resolve) => {
    try {
      detectLanguage.call(chrome.i18n, text, (result) => {
        if (chrome.runtime?.lastError) {
          resolve(null)
          return
        }
        const languages = result?.languages ?? []
        const top = languages.reduce<(typeof languages)[number] | null>(
          (best, item) => (best && best.percentage >= item.percentage ? best : item),
          null
        )
        resolve(top?.language || null)
      })
    } catch {
      resolve(null)
    }
  })
}

/**
 * CLD 语言标签 → 精选语音组 locale。
 * 按 `Intl.Locale.maximize()` 归一后比较 language / script / region，逐级放宽：
 * 完全同地区 > 同书写系统（zh-Hant → zh-TW 而不是 zh-HK，组顺序保底） > 仅同语种。
 */
function matchVoiceLocale(tag: string): string | null {
  const detected = parseLocaleTag(tag)?.maximize()
  if (!detected) return null

  let bestLocale: string | null = null
  let bestScore = 0
  for (const group of EDGE_TTS_VOICE_GROUPS) {
    const candidate = parseLocaleTag(group.locale)?.maximize()
    if (!candidate || candidate.language !== detected.language) continue
    const score =
      1 +
      (candidate.script === detected.script ? 2 : 0) +
      (candidate.region === detected.region ? 4 : 0)
    // 同分保留先出现者（zh-TW 排在 zh-HK 前，繁体书面语优先台湾国语）
    if (score > bestScore) {
      bestScore = score
      bestLocale = group.locale
    }
  }
  return bestLocale
}

/**
 * Azure/Edge 语音名格式为 `${locale}-${VoiceName}Neural`，取前两段作为语言标签解析
 * （格式由语音提供方定义，非法标签返回 null）。
 */
function voiceNameToLocale(voiceName: string): Intl.Locale | null {
  const [language, region] = voiceName.split("-")
  if (!language || !region) return null
  return parseLocaleTag(`${language}-${region}`)
}

/**
 * 按文本语言解析实际使用的语音：
 * - 同语种不同地区（en-GB 配置 + en-US 检测）→ 保留用户选择
 * - 粤语与非粤语之间、跨语种 → 切到检测语言的默认语音
 */
export async function resolveVoiceForText(text: string, configuredVoice: string): Promise<string> {
  const detected = await detectTextLocale(text)
  if (!detected) return configuredVoice

  // 粤语语音仅适合粤语白话文，与非粤语文本互不串用
  const cantoneseDetected = detected === "zh-HK"
  if (cantoneseDetected !== isCantoneseVoice(configuredVoice)) {
    return LOCALE_DEFAULT_VOICES[detected] ?? configuredVoice
  }

  const configured = voiceNameToLocale(configuredVoice)
  const detectedLocale = parseLocaleTag(detected)
  if (configured && detectedLocale && configured.language === detectedLocale.language) {
    return configuredVoice
  }
  return LOCALE_DEFAULT_VOICES[detected] ?? configuredVoice
}

/** 语音是否为粤语（zh-HK）语音：交给 ICU 推导 region，不比对字符串前缀 */
function isCantoneseVoice(voiceName: string): boolean {
  const locale = voiceNameToLocale(voiceName)?.maximize()
  return locale?.language === "zh" && locale?.region === "HK"
}
