// Edge 在线语音精选列表（按语言分组）
// 完整语音列表有 400+ 项，这里精选常用语音；用户仍可在设置中切换组内任意语音。

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

/** 常见繁体专用字（简体文本中不会出现）；用于区分 zh-CN / zh-TW */
const TRADITIONAL_ONLY_RE = /[們個學會來對時開關門長東車馬鳥語書體點國愛難顧飯錢見貝頁風飛龍麼後臺灣說話讀寫買賣兒遠運動靈雲電腦線專區處務員廳藝術觀歷讓證據豐權變確認題調發築資嚴壓適標準備狀況經濟財場競爭執評監檢報導師訊數據庫構計級層]/g

/** 粤语白话文特有字（简繁无关）；出现则视为 zh-HK */
const CANTONESE_ONLY_RE = /[嘅咗唔哋嗰喺冇攞佢谂乜嘢嚟搵傾偈]/g

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length
}

/**
 * 近似检测文本语言（脚本 + 变音符启发式）。
 * 拉丁语系只能区分出有典型变音特征的（西/德/葡/法/越），其余默认 en-US；
 * 误判时用户可关闭自动匹配。
 */
export function detectTextLocale(text: string): string | null {
  const sample = text.slice(0, 500)
  if (!sample.trim()) return null

  const han = countMatches(sample, /[\u3400-\u9fff]/g)
  const kana = countMatches(sample, /[\u3041-\u30ff]/g)
  const hangul = countMatches(sample, /[\uac00-\ud7af]/g)

  if (countMatches(sample, CANTONESE_ONLY_RE) > 0) return "zh-HK"
  // 有假名即日文（中文不含假名；日语汉字多于假名也成立）
  if (kana > 0) return "ja-JP"
  if (hangul > 0 && hangul >= han) return "ko-KR"
  if (han > 0) {
    return countMatches(sample, TRADITIONAL_ONLY_RE) >= 2 ? "zh-TW" : "zh-CN"
  }

  if (countMatches(sample, /[\u0400-\u04ff]/g) > 0) return "ru-RU"
  if (countMatches(sample, /[\u0600-\u06ff]/g) > 0) return "ar-SA"
  if (countMatches(sample, /[\u0900-\u097f]/g) > 0) return "hi-IN"
  if (countMatches(sample, /[\u0e00-\u0e7f]/g) > 0) return "th-TH"

  // 拉丁语系：越南语特有字符（đ/ơ/ư 及 Vietnamese Extended Additional 声调区）
  if (countMatches(sample, /[\u0111\u01a0\u01b0\u01af\u1ea0-\u1ef9]/gi) > 0) return "vi-VN"
  if (/[ñ¿¡]/i.test(sample)) return "es-ES"
  if (/[ãõ]/i.test(sample)) return "pt-BR"
  if (/[äöüß]/i.test(sample)) return "de-DE"
  if (countMatches(sample, /[çœàèùâêôûé]/gi) >= 2) return "fr-FR"
  if (countMatches(sample, /[a-z\u00c0-\u024f]/gi) >= 2) return "en-US"

  return null
}

/**
 * 按文本语言解析实际使用的语音：
 * - 语言与配置语音同语种（en-GB vs en-US 这类）→ 保留用户选择
 * - 跨语种（如中文文本配英文语音）→ 切到该语言默认语音
 */
export function resolveVoiceForText(text: string, configuredVoice: string): string {
  const detected = detectTextLocale(text)
  if (!detected) return configuredVoice

  const configuredLocale = configuredVoice.split("-").slice(0, 2).join("-")
  if (configuredLocale === detected) return configuredVoice

  const sameFamily = configuredLocale.split("-")[0] === detected.split("-")[0]
  // 粤语语音仅适合粤语白话文，不用于朗读普通话/繁体书面文本
  if (configuredLocale === "zh-HK" || detected === "zh-HK") {
    return LOCALE_DEFAULT_VOICES[detected] ?? configuredVoice
  }
  if (sameFamily) return configuredVoice
  return LOCALE_DEFAULT_VOICES[detected] ?? configuredVoice
}
