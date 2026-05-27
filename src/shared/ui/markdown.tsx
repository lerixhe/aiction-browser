import { marked } from "marked"
import { useMemo } from "react"

import { useUiTheme } from "~/shared/ui/theme"
import { uiTypography } from "~/shared/ui/tokens"
import { createMarkdownStyles } from "~/shared/ui/styles"

interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const theme = useUiTheme()

  const html = useMemo(() => {
    marked.setOptions({
      breaks: true,
      gfm: true
    })
    return marked.parse(content) as string
  }, [content])

  const styles = useMemo(() => createMarkdownStyles(theme), [theme])

  return (
    <>
      <style>{styles}</style>
      <div
        className="markdown-content"
        style={{
          fontSize: uiTypography.fontSize.md,
          color: theme.text.primary,
          lineHeight: uiTypography.lineHeight.relaxed
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  )
}