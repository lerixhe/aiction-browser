/**
 * BCP-47 语言标签解析工具。
 *
 * 语言标签是标准格式，解析一律交给平台 ICU（`Intl.Locale`），不要在业务代码里
 * 自己 split / startsWith / 枚举子标签——那类写法只能覆盖作者想到的写法，
 * `zh-Hans-SG`（macOS 简中系统语言）这类合法标签会被误判。
 */

/**
 * 用平台 ICU 解析语言标签，解析失败返回 null（不猜）。
 *
 * 会先尝试原样解析，再尝试把 `_` 换成 `-` 后解析（历史配置/手写值常用下划线，
 * BCP-47 规定用连字符；这里只修正分隔符，不做语义推断）。
 */
export function parseLocaleTag(tag: string | null | undefined): Intl.Locale | null {
  if (!tag) return null
  const candidates = [tag, tag.replace(/_/g, "-")]
  for (const candidate of candidates) {
    try {
      return new Intl.Locale(candidate)
    } catch {
      // 该候选不合法，试下一个
    }
  }
  return null
}
