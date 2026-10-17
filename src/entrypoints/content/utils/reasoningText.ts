/**
 * 思考过程 → 单行纯文本（供思考行的单行跑马灯显示）。
 *
 * 思考内容是 Markdown，但单行滚动只能显示纯文本：
 * 去掉标题 / 强调 / 列表 / 引用 / 链接等标记（代码块去围栏、保留内容），
 * 所有换行与连续空白折叠成一个空格，避免行内出现大段空洞。
 */
export function toSingleLine(markdown: string): string {
  return markdown
    // 代码块去围栏、保留内容（先 ``` 后 ~~~，避免相互干扰）
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, "$1")
    .replace(/~~~[^\n]*\n?([\s\S]*?)~~~/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^\s*>+\s?/gm, "")
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
}
