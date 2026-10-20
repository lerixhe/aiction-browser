# i18n 语言注册表重构（枚举集中化）开发方案

> 目标一：把「语言清单」在代码里收敛为**唯一真源**，并把两处随语言数量增长必然出错的硬编码
> （`UNSUPPORTED_CHINESE_SCRIPT` 黑名单、`resolveSystemLocale()` 中文优先）改写成**从数据派生的通用规则**。
> 目标二：语言偏好的「自动」项语义由**跟随系统**改为**跟随浏览器**（产品决策），
> 函数名 / 存储值 / UI 文案 / 埋点值域一并修正（见 §3.4、§5.3、§9）。
> 目标三：语言清单定稿为 **10 个 locale**（`az` / `en` / `es` / `ja` / `ko` / `ru` / `tr` / `vi` / `zh_CN` / `zh_TW`，
> 下拉按语言代码字母序，自动项置顶），本方案连同清单一起落地（§3.1）。
> 验收标准：接入这 10 个 locale 时，**除字典文件与 `_locales` 目录外不需要改任何逻辑代码**。
>
> 状态：**P1–P4 已落地**（registry 抽取 / tag 打分匹配 / 跟随浏览器改名与迁移 / 10 个 locale 接入 + 语言下拉），P5–P6 待做。
> ⚠️ 8 份非中文字典（`az` / `es` / `ja` / `ko` / `ru` / `tr` / `vi`）与 `zh_TW` 目前是**占位内容**（分别为英文 / 简体），键集完整但待翻译，发布前必须替换　撰写日期：基于 `ce1b3a9`　影响面：`src/shared/i18n/`、`types.ts`、`storage.ts`、`prompt.ts`、`options/AppearanceSection.tsx`

---

## 1. 现状盘点

### 1.1 语言清单散落在 5 处（手写枚举）

| # | 位置 | 形态 | 加语言时的后果 |
|---|------|------|----------------|
| 1 | `src/shared/i18n/translations.ts` | `type Locale = "en" \| "zh_CN"` + `SUPPORTED_LOCALES` 数组 + `messages` Record | 三处都要改，漏一处 = 运行时 `undefined` 字典（`getMessages` 静默回退 en，不报错） |
| 2 | `src/shared/types.ts:6` | `LanguagePreference = "system" \| "en" \| "zh_CN"` | 漏改 = 新语言存不进去（类型挡在设置页） |
| 3 | `src/shared/storage.ts:293` | `validLanguages = ["system", "en", "zh_CN"]` | **漏改 = 用户选了新语言，刷新后被 `normalizeSettings` 静默重置**（最隐蔽的一处 bug） |
| 4 | `src/shared/prompt.ts:33` | `LOCALE_DISPLAY_NAMES: Record<Locale, string>` | 这里是 `Record<Locale, …>`，漏改**会**编译报错（唯一自带保护的一处） |
| 5 | `src/entrypoints/options/AppearanceSection.tsx:21` | 手写 `languageOptions` | 漏改 = 设置页看不到新语言 |

> #1 的 `messages` Record 也是 `Record<Locale, …>`，漏改会报错；真正无保护的是 #3 与 #5。

### 1.2 两处即将成为 bug 源的硬编码 + 一处名不符实

**(a) `UNSUPPORTED_CHINESE_SCRIPT = "Hant"`（`translations.ts:30`）**

```ts
const preferred = PREFERRED_LOCALE_BY_LANGUAGE.get(locale.language)   // zh → zh_CN
if (preferred === "zh_CN" && locale.maximize().script === "Hant") return "en"
```

问题：黑名单只对 `zh` 生效且写死了「Hant 无译文」。加 `zh_TW` 后，`zh-Hant` 仍然返回 `"en"`——
**新语言永远匹配不上**，除非再补一条 `if`。同理 `zh-HK`/`zh-MO` 是否回退到 `zh_TW` 也无从表达。

**(b) `resolveSystemLocale()` 中文优先（`translations.ts:87`）**

```ts
if (resolved.includes("zh_CN")) return "zh_CN"
return resolved[0] ?? "en"
```

问题：只有「中文」享受「任一来源即采用」的待遇，其他语言全靠 `resolved[0]` 的运气。
加 8 语言后的错误表现：

| 环境（`getSystemLanguageTags()` 顺序） | 现状结果 | 期望结果 |
|---|---|---|
| UI 英文 + 系统日文 → `["en", "ja-JP"]` | `en` ❌ | `ja` |
| UI 英文 + 系统简体中文 → `["en", "zh-Hans-SG"]` | `zh_CN` ✅ | `zh_CN` |
| UI 韩文 + 系统日文 → `["ko-KR", "ja-JP"]` | `ko`（碰巧对） | `ko` |
| UI 法文 + 系统德文 → `["fr", "de-DE"]` | `fr`（碰巧对） | `fr` |

**(c) 「跟随系统」这个词本身就不准确（产品决策：改为「跟随浏览器」）**

现有实现读的是 `chrome.i18n.getUILanguage()` / `navigator.language` / `navigator.languages`——
**这三个都是浏览器侧的语言标签，扩展根本没有 API 能读到「操作系统语言」**（AGENTS.md 里 macOS
`defaults read -g AppleLanguages` 那条是人工排查用的命令，不是可用接口）。也就是说当前文案对用户
承诺了一件实现做不到的事，而「中文优先」正是为了圆这个承诺而加的特判。

**决策：语义改为「跟随浏览器」**，于是：
1. 文案与 key 改名：`options.appearance.languageSystem` → `languageAuto`（「自动（跟随浏览器）」/ "Auto (Follow Browser)"）；
   **主题的「跟随系统」(`themeAuto`) 保持不动**——主题确实跟随 `prefers-color-scheme`。
2. 判定规则不再需要「跳过默认语言、偏爱非默认语言」的跨来源提升：**按来源顺序取第一个能匹配的标签即可**
   （`chrome.i18n.getUILanguage()` 就是浏览器 UI 语言，权威来源）。
3. 函数名 `resolveSystemLocale` / `getSystemLanguageTags` → `resolveBrowserLocale` / `getBrowserUiLanguage`，
   存储值 `"system"` → `"browser"`（读时兼容旧值，见 §9）。

**这是一次有意的行为变更**：老用户里「中文系统 + 英文浏览器界面」的那批，现在会看到英文（这正是改名要表达的语义）。
其余情况不变（浏览器中文的用户仍拿到中文）。
上量前可用 `language_changed` 的存量分布评估影响面。

### 1.3 一个被忽略的 UI 容量问题

`AppearanceSection` 用 `SegmentedControl`（等宽分段按钮）渲染语言。2 项 + 自动项 = 3 段刚好；
**10 个 locale + 自动项 = 11 段**在 360px 侧栏里必然溢出/挤成不可读。这是「枚举集中化」的连带必要改动（§5.2）。

---

## 2. 设计原则

1. **单一真源**：语言清单只存在于 `src/shared/i18n/registry.ts` 的一个数组里，其余全部派生
   （类型、校验、下拉选项、提示词显示名）。
2. **id 与 BCP-47 tag 分离**：`id`（`zh_CN`，下划线）是**存储值 / 字典键 / `public/_locales` 目录名**，
   三者必须一致，刻意不做映射；`tag`（`zh-CN`，连字符）是**匹配算法的唯一依据**，交给 `Intl.Locale`。
3. **规则从数据派生，不写特例**：原来针对中文的两处特判（书写系统黑名单、非默认语言优先）
   都变成对 `tag` 的通用打分 / 淘汰规则，以及一句「按来源顺序取首个」。
4. **不猜测**：解析失败返回 `null`；「不认识的语言」与「认识但无译文」区分开（现状把后者映射成 `en`，
   属于混淆）。
5. **加语言的代价 = 加两个文件 + 注册表一行**。
6. **命名即语义**：函数名 / 存储值 / 埋点值都要说真话（没有 `resolveSystem*` 这种读浏览器却说系统的东西）。

---

## 3. 目标结构

### 3.1 目标语言清单与 `registry.ts`

定稿的 10 个 locale（与设置页下拉顺序一致，**按语言代码字母序**；
「自动（跟随浏览器）」是偏好值 `"browser"`，不是 locale，不进表）。

| id（存储值 + `_locales` 目录名） | tag（BCP-47） | 下拉显示名（`nativeName`，自称不翻） | 提示词描述（`promptName`） | `maximize()`（已实测） |
|---|---|---|---|---|
| `az` | `az` | Azərbaycanca | Azerbaijani (Azərbaycanca) | az-Latn-AZ |
| `en` | `en` | English | English（**默认 / 兜底**） | en-Latn-US |
| `es` | `es` | Español | Spanish (Español) | es-Latn-ES |
| `ja` | `ja` | 日本語 | 日本語（Japanese） | ja-Jpan-JP |
| `ko` | `ko` | 한국어 | 한국어（Korean） | ko-Kore-KR |
| `ru` | `ru` | Русский | Русский（Russian） | ru-Cyrl-RU |
| `tr` | `tr` | Türkçe | Turkish (Türkçe) | tr-Latn-TR |
| `vi` | `vi` | Tiếng Việt | Vietnamese (Tiếng Việt) | vi-Latn-VN |
| `zh_CN` | `zh-CN` | 简体中文 | 简体中文（Simplified Chinese） | zh-Hans-CN |
| `zh_TW` | `zh-TW` | 繁體中文 | 繁體中文（Traditional Chinese） | zh-Hant-TW |

数组顺序 = 同分优先级。这 10 个里只有 `zh_CN` / `zh_TW` 同语言，但两者 script 不同（由 §3.3 规则淘汰区分），
**顺序无实际影响** → 保留字母序是为了下拉观感稳定（新增语言不必重排）、方便人工核对。

> `zh_TW` 加入后，原来的 `UNSUPPORTED_CHINESE_SCRIPT = "Hant"` 黑名单**自动失效**：
> `zh-Hant` / `zh-TW` / `zh-HK` / `zh-MO` 由 tag 规则直接命中 `zh_TW`，无需改一行匹配代码。
> 但**繁体字典建议强制全量**（不允许缺键回退英文，见 §6）：简体字与繁体字混排的观感远比其他语言差。

### 3.2 `registry.ts` 骨架

```ts
import az from "@/shared/i18n/locales/az"
import en from "@/shared/i18n/locales/en"
import es from "@/shared/i18n/locales/es"
import ja from "@/shared/i18n/locales/ja"
import ko from "@/shared/i18n/locales/ko"
import ru from "@/shared/i18n/locales/ru"
import tr from "@/shared/i18n/locales/tr"
import vi from "@/shared/i18n/locales/vi"
import zhCN from "@/shared/i18n/locales/zh_CN"
import zhTW from "@/shared/i18n/locales/zh_TW"

/**
 * 界面语言注册表：唯一真源。
 *
 * 新增一门语言 = 加字典文件 + 加 `public/_locales/<id>/messages.json` + 这里追加一行。
 * 不要在别处再写语言清单（类型 / 校验 / 选项 / 提示词显示名全部从这里派生）。
 * 数组顺序 = 同分时的优先级（见 matchLocale），也是设置页下拉的显示顺序。
 */
export const SUPPORTED_LOCALES = [
  // id：存储值 + 字典键 + _locales 目录名（三者必须一致，不做映射）
  // tag：BCP-47 标签，语言匹配的唯一依据
  // nativeName：语言选择器里的显示名（自称，不翻译）
  // promptName：注入系统提示词的可读描述（给模型看）
  { id: "az", tag: "az", nativeName: "Azərbaycanca", promptName: "Azerbaijani (Azərbaycanca)", messages: az as Record<string, string> },
  { id: "en", tag: "en", nativeName: "English", promptName: "English", messages: en as Record<string, string> },
  { id: "es", tag: "es", nativeName: "Español", promptName: "Spanish (Español)", messages: es as Record<string, string> },
  { id: "ja", tag: "ja", nativeName: "日本語", promptName: "日本語（Japanese）", messages: ja as Record<string, string> },
  { id: "ko", tag: "ko", nativeName: "한국어", promptName: "한국어（Korean）", messages: ko as Record<string, string> },
  { id: "ru", tag: "ru", nativeName: "Русский", promptName: "Русский（Russian）", messages: ru as Record<string, string> },
  { id: "tr", tag: "tr", nativeName: "Türkçe", promptName: "Turkish (Türkçe)", messages: tr as Record<string, string> },
  { id: "vi", tag: "vi", nativeName: "Tiếng Việt", promptName: "Vietnamese (Tiếng Việt)", messages: vi as Record<string, string> },
  { id: "zh_CN", tag: "zh-CN", nativeName: "简体中文", promptName: "简体中文（Simplified Chinese）", messages: zhCN as Record<string, string> },
  { id: "zh_TW", tag: "zh-TW", nativeName: "繁體中文", promptName: "繁體中文（Traditional Chinese）", messages: zhTW as Record<string, string> }
] as const satisfies readonly LocaleDefinition[]

export interface LocaleDefinition {
  id: string
  tag: string
  nativeName: string
  promptName: string
  messages: Record<string, string>
}

export type Locale = (typeof SUPPORTED_LOCALES)[number]["id"]

export const DEFAULT_LOCALE: Locale = "en"

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && SUPPORTED_LOCALES.some((row) => row.id === value)
}

export function getLocaleDefinition(locale: Locale): LocaleDefinition {
  return SUPPORTED_LOCALES.find((row) => row.id === locale) ?? SUPPORTED_LOCALES[0]
}

/** 字典（缺键时合并英文兜底 —— 加语言不必一次翻全，见 §6 可选增强） */
export function getMessages(locale: Locale): Record<string, string> {
  return locale === DEFAULT_LOCALE
    ? getLocaleDefinition(locale).messages
    : { ...getLocaleDefinition(DEFAULT_LOCALE).messages, ...getLocaleDefinition(locale).messages }
}
```

要点：
- **漏加字典不可能发生**：字典就在行内，`as const` 会因缺字段报错。
- `Locale` 由数组派生，不再是手写联合类型。
- `satisfies readonly LocaleDefinition[]`：shape 校验 + 保留字面量类型（供 `Locale` 派生）。
- `translations.ts` 保留为**薄壳 re-export**（`export * from "./registry"` + 匹配逻辑），
  这样全仓 20+ 处 `import ... from "@/shared/i18n/translations"` 一行都不用改 —— 也让 Step 1 的
  「纯搬运」可以用「typecheck 全绿」直接证明无副作用。

### 3.3 匹配算法（替换 `PREFERRED_LOCALE_BY_LANGUAGE` + `UNSUPPORTED_CHINESE_SCRIPT`）

以下代码住在 `translations.ts`（它 import `SUPPORTED_LOCALES` 与 `parseLocaleTag`），与注册表职责分开：
registry 负责「有哪些语言」，translations 负责「标签怎么对上去」。

```ts
interface LocaleCandidate { id: Locale; language: string; script?: string; region?: string }

/**
 * 候选预计算：每行 locale 的 tag 一律 maximize() 归一。
 * 例：en → en-Latn-US，zh-CN → zh-Hans-CN，zh-TW → zh-Hant-TW，ja → ja-Jpan-JP。
 */
const CANDIDATES: LocaleCandidate[] = SUPPORTED_LOCALES.map((row) => {
  const parsed = parseLocaleTag(row.tag)
  if (!parsed) throw new Error(`[i18n] locale "${row.id}" 的 tag "${row.tag}" 不是合法 BCP-47 标签`)
  const max = parsed.maximize()
  return { id: row.id, language: max.language, script: max.script ?? undefined, region: max.region ?? undefined }
})

/**
 * 语言标签 → 受支持的 locale；语言不认识 / 该书写系统无译文时返回 null（不猜、不降级到别的语言）。
 *
 * 规则（全部从 tag 派生，无特例）：
 * 1. 主语言不同 → 不是候选。
 * 2. 书写系统都有值且不同 → 淘汰（这是原 UNSUPPORTED_CHINESE_SCRIPT 的通用版：
 *    候选 zh-Hant 与 zh-CN(Hans) 冲突 → 淘汰；有了 zh-TW(Hant) 行后自动命中，零代码改动）。
 * 3. 同语言内打分：script 相同 +2，region 相同 +1。
 * 4. 取最高分；同分取 SUPPORTED_LOCALES 靠前者（声明顺序即优先级）。
 */
export function matchLocale(tag: string | null | undefined): Locale | null {
  const parsed = parseLocaleTag(tag)
  if (!parsed) return null
  const max = parsed.maximize()
  let best: { id: Locale; score: number } | null = null
  for (const candidate of CANDIDATES) {
    if (candidate.language !== max.language) continue
    if (candidate.script && max.script && candidate.script !== max.script) continue
    let score = 0
    if (candidate.script && candidate.script === max.script) score += 2
    if (candidate.region && candidate.region === max.region) score += 1
    if (!best || score > best.score) best = { id: candidate.id, score }
  }
  return best?.id ?? null
}

export function resolveLocale(tag: string | null | undefined): Locale {
  return matchLocale(tag) ?? DEFAULT_LOCALE
}
```

**行为对照（已用 Node 实测 `Intl.Locale.maximize()` 取值，非推测）**

| 候选 tag | maximize | 只有 en+zh_CN 时 | 10 个 locale 就位后 | 说明 |
|---|---|---|---|---|
| `zh`（CLD 返回值） | zh-Hans-CN | `zh_CN` | `zh_CN` | +2(script)+1(region) |
| `zh-Hans-SG`（macOS 简中） | zh-Hans-SG | `zh_CN` | `zh_CN` | script 命中（region 无加分） |
| `zh-TW` | zh-Hant-TW | `null` → en | `zh_TW` | 现状由黑名单挡掉 |
| `zh-HK` / `zh-MO` | zh-Hant-HK / -MO | `null` → en | `zh_TW` | script 命中、region 无加分 |
| `en-GB` | en-Latn-GB | `en` | `en` | script 命中 |
| `de-AT` | de-Latn-AT | `null` → en | `de` | 语言候选按 script 命中 |
| `pt-PT` | pt-Latn-PT | — | `pt_BR` | 只有一种葡语译文时命中它 |
| `es-419` | es-Latn-419 | — | `es` | region 不同不淘汰 |
| `zh_CN`（带下划线的历史值） | zh-Hans-CN | `zh_CN` | `zh_CN` | `parseLocaleTag` 的 `_`→`-` 修正 |
| `""` / `xxx-!!` / `undefined` | — | `null` → en | 同 | 解析失败不猜 |

**语义变化**：`matchSupportedLocale("zh-Hant")` 现状返回 `"en"`（`zh_CN` 分支显式返回 en），
新实现返回 `null`。三处调用者的结果**完全等价**：
- `resolveLocale` 有 `?? DEFAULT_LOCALE`；
- `resolveBrowserLocale` 使用 `matchLocale`，列表里没有它也只是少一个候选；
- `prompt.ts` 走上述两个函数。

**已知取舍（写进 AGENTS.md，不修）**：
- 书写系统冲突 = 该语言整体无译文（`sr-Latn` 不会命中文 `sr`(Cyrl)）。理由：字形/术语完全不同的
  「同一语言」用错比回退英文更糟 —— 这正是原黑名单的初衷，只是现在它由数据表达而非特判。
  当前 8 种目标语言除中文外书写系统唯一，不受影响。
- 同分取数组声明顺序：谁更「通用」就写前面（如 `pt_BR` 与未来的 `pt_PT`）。

### 3.4 `resolveBrowserLocale()`：跟随浏览器（替换中文优先 + 改名）

**决策已定（D1）：只信 `chrome.i18n.getUILanguage()`，不读 `navigator.*`。**

```ts
/**
 * 浏览器 UI 语言标签：**唯一来源**。
 *
 * 只认 `chrome.i18n.getUILanguage()`（MV3 权威来源；Firefox 经 WXT 的 browser/chrome 兼容层同样可用）。
 * 刻意**不读** `navigator.language` / `navigator.languages`：在 macOS 上它们可能反映**系统语言**，
 * 读进来会让「跟随浏览器」静默退化成「跟随系统」。
 * 拿不到（非扩展上下文：合成页测试 / 纯网页注入）→ null，由调用方落默认。
 */
export function getBrowserUiLanguage(): string | null {
  try {
    // 必须先用 typeof 判断：可选链保护不了「变量未声明」的 ReferenceError
    if (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage) {
      return chrome.i18n.getUILanguage() || null
    }
  } catch {
    // chrome.i18n 在某些上下文不可用，忽略
  }
  return null
}

/** 「跟随浏览器」：浏览器 UI 语言 → 受支持 locale，无法识别 → 默认 */
export function resolveBrowserLocale(): Locale {
  return matchLocale(getBrowserUiLanguage()) ?? DEFAULT_LOCALE
}
```

**行为变化**

| 浏览器 UI 语言（`getUILanguage()`） | 现状（跟随系统，会读 `navigator.*`） | 新（跟随浏览器） | 备注 |
|---|---|---|---|
| `en-US` | `en` | `en` | 等价 |
| `zh-CN` | `zh_CN` | `zh_CN` | 等价（中文浏览器用户不受影响） |
| `zh-Hans-SG`（macOS 简中） | `zh_CN` | `zh_CN` | 等价（tag 解析仍是同一套） |
| `zh-TW` / `zh-HK` | `en`（Hant 黑名单） | `zh_TW` | 新语言上线后自动命中 |
| `de-DE`（无译文）+ 系统中文 | `zh_CN`（靠 `navigator` 把过来的） | `en` | **有意的语义变更**：UI 无译文就回退默认，不再去猜系统 |
| `en-US` + 中文系统 | `zh_CN` | `en` | **有意的语义变更**（改名要表达的正是这个） |
| `az` / `tr` / `vi` / … | — | 各自 | 新语言 |
| `chrome.i18n` 不可用 | 可能靠 `navigator` 猜 | `en`（显式默认） | 合成页测试需 stub `chrome.i18n.getUILanguage`（AGENTS.md 的测试方式已 stub `chrome.runtime` / `chrome.storage`，加一条即可） |

**为什么这个严格版本反而更简单**：直接删掉原 `getSystemLanguageTags()` 的多来源收集（两条来源 + 去重 +
「任一非默认优先」），只留一个取值函数；连「多来源冲突时谁优先」这个永远吵不清的决策也一并消失。
代价是放弃一层本就不存在的「兜底」，收益是行为可预测、测试可注入。

---

## 4. `translations.ts` 职责收敛

重构后：

| 文件 | 职责 |
|---|---|
| `registry.ts` | 语言清单（唯一真源）、`Locale` 类型、`isLocale` / `getMessages` / `getLocaleDefinition` |
| `translations.ts` | 语言**匹配**：`matchLocale` / `resolveLocale` / `resolveBrowserLocale` / `getBrowserUiLanguage`；并 re-export registry（保持历史 import 路径可用） |

如果希望更彻底，也可以把匹配逻辑并入 `registry.ts` 并删掉 `translations.ts`（20+ 处 import 要改）。
**本次不做**：re-export 薄壳已经达成「单一真源」，且让 Step 1 的 diff 可被 typecheck 证明为零副作用。

---

## 5. 五处枚举的收敛

### 5.1 对照表

| 文件 | 现状 | 改为 |
|---|---|---|
| `translations.ts` | `Locale` 联合 + `SUPPORTED_LOCALES` + `messages` | 由 `registry.ts` 派生（§3.2） |
| `shared/types.ts:6` | `"system" \| "en" \| "zh_CN"` | `export type LanguagePreference = "browser" \| Locale`（`import type`，不引入运行时依赖） |
| `shared/storage.ts:293` | `validLanguages` 数组 | `const language = isLanguagePreference(saved.language) ? saved.language : DEFAULT_SETTINGS.language`，其中 `isLanguagePreference = (v) => v === "browser" \|\| isLocale(v)`（放 storage.ts 内联或 registry 提供 `isLocale` 组合） |
| `shared/defaults.ts:130` | `language: "system"` | `language: "browser"` |
| `shared/prompt.ts:33` | `LOCALE_DISPLAY_NAMES` Record | 删表，用 `getLocaleDefinition(locale).promptName` |
| `options/AppearanceSection.tsx:21` | 手写 3 项 | `[{ value: "browser", label: t("options.appearance.languageAuto") }, ...SUPPORTED_LOCALES.map(r => ({ value: r.id, label: r.nativeName }))]`（自动项置顶，后接 10 项字母序） |
| `locales/{en,zh_CN}.ts` | key `options.appearance.languageSystem`（「跟随系统」/ "Follow System"） | 改名 `options.appearance.languageAuto`，值「自动（跟随浏览器）」/ "Auto (Follow Browser)" |

> `prompt.ts` 是唯一「漏改会编译报错」的地方，收敛后连它的编译期保护也不再需要（表没了）。

**不要误改的地方**：`themeAuto` / `themeDesc` / `cardDesc` 里的「跟随系统」指的是**主题**
（真的跟随 `prefers-color-scheme`），保留原文案。

### 5.2 控件必须换：`SegmentedControl` → `SelectField`

`SegmentedControl` 是等宽分段按钮，9 段在 360px 侧栏必然溢出。改为 `SelectField`（`primitives.tsx`
已有该 primitive，原生 `<select>`）。改动点：
- 语言行仍是**即时项**（`docs/OPTIONS_UI.md` §56 已明确「界面语言 = 即时」，落后端无草稿），不改保存语义。
- `SelectField` 的 `onValueChange: (value: string) => void`，需要收窄：
  ```tsx
  if (isLanguagePreference(value)) { saveSettingsNow(c => ({ ...c, language: value })); trackEvent(...) }
  ```
  顺带给把 `SegmentedControl` 泛型化的念头打住 —— 下拉就够，8 语言不该用分段。
- `docs/OPTIONS_UI.md` 需登记：控件表新增「界面语言 = 下拉（即时）」，并把「外观页两处 `SegmentedControl`」
  的表述改为「主题用分段、语言用下拉（选项数随语种增长）」。
- 语言显示名用 `nativeName`（自称）而非翻译键：否则每加一门语言要多翻 N 份「英语 / 日语 / …」，
  而「日本語」对所有用户都可读。

### 5.3 「跟随系统 → 跟随浏览器」改名清单（旧 → 新）

| 维度 | 旧 | 新 |
|---|---|---|
| 函数 | `resolveSystemLocale()` | `resolveBrowserLocale()` |
| 函数 | `getSystemLanguageTags()` | `getBrowserUiLanguage()`（返回**单个**标签，不再收集多来源） |
| 存储值 | `"system"` | `"browser"`（读时兼容 `"system"`，见 §9） |
| i18n key | `options.appearance.languageSystem` | `options.appearance.languageAuto` |
| 文案 | 跟随系统 / Follow System | 自动（跟随浏览器）/ Auto (Follow Browser) |
| 埋点值 | `from_language` / `to_language` 可为 `"system"` | 新值 `"browser"`；历史 `"system"` 视为同值合并统计 |
| 默认值 | `DEFAULT_SETTINGS.language = "system"` | `"browser"` |

不改名的：「主题跟随系统」（`themeAuto`）、TTS 引擎的 `"system"`（`SpeechEngine` / `TtsProvider`，
指浏览器内置语音，与语言偏好无关）。

自检：`rg -n "resolveSystemLocale|getSystemLanguageTags|languageSystem|languageBrowser" src` 应零命中；
`rg -n "跟随系统|Follow System" src/shared/i18n/locales` 应只剩主题相关的三处。

---

## 6. 可选增强（P5，与主重构解耦，可单独取舍）

1. **字典合并兜底**（已在 §3.2 的 `getMessages` 里体现）：缺键时用英文而非显示 key。
   配合下面第 2 项的键集校验，才不会把漏翻藏起来。
   **例外：`zh_TW` 建议强制全量**（繁简混排比其他语言的英文混排难看得多），脚本里对 `zh_TW` 用严格模式。
2. **字典键集类型校验**（成本极低，收益在 10 语言期）：
   ```ts
   // locales/en.ts
   const en = { "errors.noApiKey": "…", /* … */ }
   export type MessageKey = keyof typeof en
   export default en

   // locales/zh_CN.ts
   import type { MessageKey } from "./en"
   export default { /* … */ } satisfies Record<MessageKey, string>
   ```
   效果：缺键 / 多键 / 拼错键名 = 编译错误（当前 267 键靠人眼看）。`t()` 的签名仍收 `string`，
   不做全仓改造。

---

## 7. 验证与门禁

项目无测试框架，采用「一次性脚本 + 构建期门禁」：

### 7.1 新增 `scripts/check-i18n.ts`（`npx tsx scripts/check-i18n.ts`，加 `npm run check:i18n` 入口）

五项断言，任一失败 `process.exit(1)`：

1. **tag 合法性**：每个 locale 的 `tag` 能被 `parseLocaleTag` 解析（并打印 `maximize()` 结果，便于 review）。
2. **`_locales` 与注册表一致**：10 个 `public/_locales/<id>/messages.json` 均存在；各语言 `messages.json`
   **键集与 `en` 完全一致**（`extName` / `extDescription` 漏翻是最常见的上架事故）。
3. **`wxt.config.ts` 的 `default_locale` 必须存在于 `_locales`**（并与 `DEFAULT_LOCALE` 对应，脚本里断言字符串一致）。
4. **字典键集一致**：每个 `locales/<id>.ts` 的键集 vs `en`：`zh_TW` 必须**完全相等**（禁缺键），其余允许 ⊇（缺键走英文兜底，P5 落地后由 TS 编译期负责）。
5. **匹配与偏好矩阵**：把 §3.3 与 §3.4 的表格写成 fixture 断言（`matchLocale` 覆盖 10 个 locale 的 tag + 常见地区变体
   `en-GB` / `es-419` / `zh-Hans-SG` / `zh-HK` / `az-Latn` / `tr-Cyrl` / `de-DE` / 非法标签；
   `resolveBrowserLocale` 注入 stub 的 `getUILanguage()` 返回值，包括“不可用”分支；
   `normalizeSettings` 对 `"system"` / `"browser"` / 未知字面量的归属）。
   这是**唯一能防止「以后又有人加特判」的机制** —— 换语言/改算法时必须让矩阵绿。

> 建议把 `npm run check:i18n` 挂到 `build` 前面（与 `bundle-icons` 同款做法，脚本是纯文件读取 + 纯计算，
> 几十毫秒），让「加语言漏 `_locales`」在构建期就炸，而不是等商店审核。

### 7.2 人工验证

- `npm run typecheck` + `npm run build`（每次改动后必跑，见 AGENTS.md 工作流规则）。
- 设置页：切到每种语言 → 界面立即刷新（`i18nStore.setLocale` 链路）；刷新页面后语言保留（验证 #3 那处
  `normalizeSettings` 没有把你重置掉）—— **这是本次重构最容易回归的一条**。
- 「跟随浏览器」：用 AGENTS.md 记录的 Chrome for Testing + `sw.evaluate()` 在 SW 里直接调
  `resolveLocale("zh-TW")` / `resolveBrowserLocale()` 打表，比改系统设置快得多。
- 内容脚本：划词工具栏 + 对话窗文案随语言切换（`I18nRoot` 链路）。

### 7.3 收尾 grep（Definition of Done 的机械检查）

```bash
# 语言清单只应出现在 registry.ts / locales/* / public/_locales/*
rg -n '"zh_CN"|"en"|zh-CN' src --glob '!src/shared/i18n/**' \
   --glob '!**/edge-tts-voices.ts' --glob '!**/defaults.ts'
```

预期剩余命中：`edge-tts-voices.ts`（TTS 语音语言标签，另一套体系，本次不动）、
`defaults.ts` 的 `edgeVoice: "zh-CN-XiaoxiaoNeural"`（语音名，非 UI 语言）、`locales/*`。

---

## 8. 分阶段提交计划

每一步都可独立验证、独立回滚；**P1、P2 严格零行为变更**，**P3 是唯一一次有意的行为变更**（单独 commit，便于回滚）。

| 步骤 | 内容 | 验收 | 预估 |
|---|---|---|---|
| **P0 基线** | 记录 `typecheck` / `build` / `check-i18n`（新建前的现有状态）+ `rg` 快照 | 全绿 | 10min |
| **P1 纯搬运** | 新建 `registry.ts`；`translations.ts` 改为 re-export + 保留匹配逻辑；**不动算法** | `typecheck` 全绿即证明搬运无副作用 | 30min |
| **P2 匹配重写** | `matchLocale` 打分/淘汰规则替换黑名单；新增 `scripts/check-i18n.ts`（先只放 §3.3 矩阵）；`matchSupportedLocale` 返回 `null` 语义 | 矩阵全绿 + 与 P1 结果逐条比对（§3.3 表格） | 1.5h |
| **P3 跟随浏览器** | 函数改名（`resolveBrowserLocale` / `getBrowserUiLanguage`）；规则改为「只信 `getUILanguage()`，不读 `navigator.*`」；存储值 `"system"` → `"browser"`（`normalizeSettings` 兼容旧值）；`languageSystem` → `languageAuto`（「自动（跟随浏览器）」）；§3.4 矩阵断言；`docs/ANALYTICS.md` 值域补注 | 矩阵全绿；旧值 `"system"` 读取后落为 `"browser"`；`rg` 零命中 | 1h |
| **P4 枚举收敛** | `types.ts` / `storage.ts` / `prompt.ts` / `AppearanceSection.tsx`（改 `SelectField`） | 切语言即时生效 + 刷新后保留（含旧值 `system`）+ `docs/OPTIONS_UI.md` 已更新 | 1h |
| **P5 可选增强** | 字典合并兜底 + `satisfies Record<MessageKey, string>` 键集校验 + 脚本第 4/5 项 | `typecheck` 能抓到删键 | 45min |
| **P6 文档** | AGENTS.md 新增「新增语言 checklist」+ 不变量（禁止中文优先 / 禁止书写系统黑名单 / 禁止把自动项叫「系统」）；改写 AGENTS.md 现有「跟随系统语言」一节；docs/README.md 索引 | 文档与代码一致 | 40min |

**总计约 5–5.5h**（含验证），其中 P1–P3 是「防未来 bug」的核心，P4 是「让新语言真的能被选中」。

---

## 9. 兼容性与迁移

- **存储值**：`"en"` / `"zh_CN"` 原样保留；新语言 id 用**下划线**
  （与 `public/_locales/zh_TW/` 目录名对齐，避免维护一张 `id → 目录名` 映射表）。
- **`"system"` → `"browser"` 迁移**（唯一需要迁移的值）：
  ```ts
  // storage.ts normalizeSettings：历史值 "system" 与当前自动项等价
  const AUTOMATIC_LANGUAGE_LEGACY = "system" as const
  const raw = saved.language === AUTOMATIC_LANGUAGE_LEGACY ? "browser" : saved.language
  const language = isLanguagePreference(raw) ? raw : DEFAULT_SETTINGS.language
  ```
  注意：即使不写这段迁移，结果也**恰好**等价（旧值因不合法而回退到默认 `"browser"`），
  但显式迁移可避免未来「默认值不再是 browser」时语义漂移，也让备份导入不受影响。
  写入总是落 `"browser"`，存储值不需要一次性批量刷。
- **旧值兜底**：`normalizeSettings` 命中未知值 → `DEFAULT_SETTINGS.language`（`"browser"`）。
- **埋点**：`language_changed` 的 `from_language` / `to_language` 值域变为
  `"browser" + SUPPORTED_LOCALES.map(id)`。**需同步 `docs/ANALYTICS.md` §2 的属性说明**：标注
  「历史值 `system` 与 `browser` 同义，做时间序列分析时需合并」（不是事件变更，不改 `docs/PRIVACY_POLICY.md`）；
  属性值仍是封闭集，不违反 §3「禁止自由文本」。
- **`Locale` 类型消费者**：`useI18n` / `i18nStore` / `I18nProvider` 全部只依赖类型，无需改。
- **`public/_locales` 的 10 份 `messages.json`**：属下一步「加语言」的工作量（商店元数据），不在本次范围，
  但 `check-i18n` 第 2 项会强制它与注册表对齐。

---

## 10. 明确不在本次范围

1. **TTS 语音组的语言匹配**（`edge-tts-voices.ts` 的 `matchVoiceLocale` / 17 个语音组）——
   那是「文本语言 → 语音」，与「UI 语言」无对应关系，共用 `parseLocaleTag` 已是最大交集。
   登记为待办：**长期存在两套语言匹配逻辑**，未来若要统一，只应复用 tag 解析与「书写系统冲突淘汰」规则，
   不要把语音组塞进 `SUPPORTED_LOCALES`。
2. **繁体中文译文本身**（`zh_TW` 字典内容）—— 本次只保证机制就位：加字典后行为正确。
3. **`translations.ts` 删除**（并入 registry）—— 纯路径 churn，收益低于 diff 噪音。
4. **`t()` 的键类型化**（`MessageKey` 收窄全仓调用）—— 与多语言接入无直接关系。

---

## 11. 重构完成后的「加一门语言」checklist（验收用）

```
1. src/shared/i18n/locales/<id>.ts          ← 复制 en.ts，翻译（缺键由 satisfies 编译期提示）
2. public/_locales/<id>/messages.json       ← extName / extDescription
3. src/shared/i18n/registry.ts              ← SUPPORTED_LOCALES 追加一行（id / tag / nativeName / promptName / messages）
4. npx tsx scripts/check-i18n.ts            ← 五项断言全绿（含 _locales 键集、匹配矩阵）
5. npm run typecheck && npm run build
6. 设置页切到新语言 → 立即生效；刷新后仍保留；「跟随浏览器」在该浏览器语言下命中它
```

**任何一步需要动第 3 项以外的逻辑代码（匹配、校验、UI 选项），都是本次重构没做到位。**

---

## 12. 风险与对策

| 风险 | 对策 |
|---|---|
| `matchLocale` 打分规则引入新的误判 | §7.1 的矩阵 fixture 覆盖 10 个 locale + 20 余个真实标签（含 macOS `zh-Hans-SG`、CLD 的 `zh`、`zh-HK`、`az-Latn`、`tr-Cyrl`）；改算法必须让矩阵绿 |
| `resolveBrowserLocale` 语义变更影响现有中文用户 | 「中文浏览器」路径结果全部不变（已列表核对）。受影响的有两批：①英文浏览器 + 非英语系统；②浏览器 UI 语言无译文（如 `de-DE`）但系统是受支持语言。两者都是本次有意的语义修正，上线前用 `language_changed` 存量分布估影响面 |
| 只信 `getUILanguage()` 后失去 `navigator.*` 兜底 | 接受：兜底本就不存在（旧实现的「兜底」实际是猜系统语言）。代价是合成页测试必须 stub `chrome.i18n.getUILanguage`，写进 AGENTS.md 的测试说明 |
| 存储值改名导致老用户语言被重置 | 显式迁移 `"system"`→`"browser"`；`check-i18n` 断言 `normalizeSettings` 对每个旧/新值往返保持；人工验「刷新后语言保留」 |
| 误改主题的「跟随系统」文案 | §5.1 列了「不要误改的地方」+ `rg` 自检命令 |
| 改 `SelectField` 破坏设置页布局 | 遵循 `docs/OPTIONS_UI.md` 行式布局，语言行结构不变（标题 + 描述 + 右侧控件）；控件宽度按 `opt-select` 既有规范 |
| 「刷新后语言被重置」回归（#3 那处最隐蔽） | 显式人工验证 + `check-i18n` 里断言 `normalizeSettings` 对每个受支持 id 往返保持 |
| 字典合并兜底掩盖漏翻 | 兜底只在 P5 与键集校验（编译期）同时存在时才启用 |
