import { useCallback, useEffect, useRef, useState } from "react"
import * as pdfjsLib from "pdfjs-dist"

import SelectionToolbar from "@/entrypoints/content/components/SelectionToolbar"
import ChatSession from "@/entrypoints/content/components/ChatSession"
import { fallbackAnchor, type AnchorRect } from "@/entrypoints/content/components/floating"
import { useChatSessions } from "@/entrypoints/content/hooks/useChatSessions"
import { useToolbarState } from "@/entrypoints/content/hooks/useToolbarState"
import { initContentScriptAnalytics, trackEvent } from "@/shared/analytics"
import { resolveActionTemplate, formatFreeInputPrompt } from "@/shared/prompt"
import { getSettings } from "@/shared/storage"
import { useI18n } from "@/shared/i18n/context"
import type { SelectionAnchor, SelectionContext, QuickAction } from "@/shared/types"

// Set worker source - use the .mjs worker file from pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.mjs")

interface PdfPageProps {
  pdf: pdfjsLib.PDFDocumentProxy
  pageNumber: number
  scale: number
}

function PdfPage({ pdf, pageNumber, scale }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    const renderPage = async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return

      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      const textLayer = textLayerRef.current
      const container = containerRef.current
      if (!canvas || !textLayer || !container) return

      const context = canvas.getContext("2d")
      if (!context) return

      // Set canvas dimensions
      canvas.height = viewport.height
      canvas.width = viewport.width

      // Set container dimensions to match canvas exactly
      container.style.width = `${viewport.width}px`
      container.style.height = `${viewport.height}px`
      
      // Set CSS variables required by pdf.js TextLayer
      container.style.setProperty('--scale-factor', `${scale}`)
      container.style.setProperty('--user-unit', '1')
      container.style.setProperty('--total-scale-factor', `${scale}`)
      
      // Also set on the textLayer div itself
      textLayer.style.setProperty('--scale-factor', `${scale}`)
      textLayer.style.setProperty('--user-unit', '1')
      textLayer.style.setProperty('--total-scale-factor', `${scale}`)
      
      // Set textLayer dimensions to match canvas
      textLayer.style.width = `${viewport.width}px`
      textLayer.style.height = `${viewport.height}px`

      // Render PDF page to canvas
      await page.render({
        canvas,
        viewport
      }).promise
      if (cancelled) return

      // Clear text layer
      textLayer.innerHTML = ""

      // Use pdf.js official TextLayer API with streamTextContent
      // This is the same method used by pdf.js's official viewer
      const textLayerInstance = new pdfjsLib.TextLayer({
        textContentSource: page.streamTextContent({
          includeMarkedContent: true,
          disableNormalization: true
        }),
        container: textLayer,
        viewport
      })

      await textLayerInstance.render()
      
      // Add endOfContent element (same as pdf.js official viewer)
      const endOfContent = document.createElement("div")
      endOfContent.className = "endOfContent"
      textLayer.appendChild(endOfContent)
      
      // Add mouse event handling for selection (same as pdf.js official viewer)
      textLayer.addEventListener("mousedown", () => {
        textLayer.classList.add("selecting")
      })
      
      // Remove selecting class on mouseup
      document.addEventListener("mouseup", () => {
        textLayer.classList.remove("selecting")
      }, { once: true })
    }

    void renderPage()

    return () => {
      cancelled = true
    }
  }, [pdf, pageNumber, scale])

  return (
    <div
      ref={containerRef}
      className="pdf-page"
      style={{
        position: "relative",
        marginBottom: "10px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
      }}>
      <canvas ref={canvasRef} />
      <div
        ref={textLayerRef}
        className="textLayer"
        data-pdfjs-textlayer="true"
      />
    </div>
  )
}

export function PdfViewerPage() {
  const extensionRootRef = useRef<HTMLDivElement | null>(null)
  const { t } = useI18n()
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [scale] = useState(1.5)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void initContentScriptAnalytics()
    
    // Set CSS variables on document root for pdf.js
    document.documentElement.style.setProperty('--scale-factor', `${scale}`)
    document.documentElement.style.setProperty('--user-unit', '1')
    document.documentElement.style.setProperty('--total-scale-factor', `${scale}`)
  }, [])

  // Load PDF from URL parameter
  useEffect(() => {
    const loadPdf = async () => {
      const params = new URLSearchParams(window.location.search)
      const pdfUrl = params.get("url")

      if (!pdfUrl) {
        setError(t("pdf.noUrl"))
        setLoading(false)
        return
      }

      try {
        const decodedUrl = decodeURIComponent(pdfUrl)
        const loadingTask = pdfjsLib.getDocument(decodedUrl)
        const pdfDoc = await loadingTask.promise
        setPdf(pdfDoc)
        setNumPages(pdfDoc.numPages)
        setLoading(false)
      } catch (err) {
        setError(t("pdf.loadFailed", [err instanceof Error ? err.message : t("errors.unknownError")]))
        setLoading(false)
      }
    }

    void loadPdf()
  }, [])

  // Use toolbar state hook
  const {
    toolbarVisible,
    toolbarAnchor,
    selectionContext,
    actions,
    quickActions,
    closeToolbar,
    openToolbar,
    toolbarVisibleRef
  } = useToolbarState()

  // ---------- 悬浮对话窗锚点（触发时刻的工具栏落位） ----------

  /** 工具栏实时落位（SelectionToolbar 上报），触发动作时快照给对话窗 */
  const toolbarRectRef = useRef<AnchorRect | null>(null)
  const handleToolbarRectChange = useCallback((rect: AnchorRect) => {
    toolbarRectRef.current = rect
  }, [])

  /** 取当前工具栏落位快照（无上报记录时用选区锚点兜底） */
  const takeToolbarAnchor = useCallback((): AnchorRect | null => {
    if (toolbarRectRef.current) return { ...toolbarRectRef.current }
    return fallbackAnchor(toolbarAnchor)
  }, [toolbarAnchor])

  /**
   * 对话会话管理（多实例并存）：新触发总是追加全新实例，钉住的实例继续驻留；
   * 关闭（× / 点外 / Esc）时按实例逐个销毁。Esc 在 hook 内统一监听，一次关一个。
   */
  const { sessions, openSession, closeSession, setSessionPinned, hasSessionForPrompt } = useChatSessions()

  // Custom selection detection for PDF text layer
  useEffect(() => {
    let selectionTimeout: ReturnType<typeof setTimeout> | null = null

    const handleMouseUp = (e: MouseEvent) => {
      // Delay to allow selection to complete
      if (selectionTimeout) clearTimeout(selectionTimeout)
      selectionTimeout = setTimeout(() => {
        const selection = window.getSelection()
        const selectedText = selection?.toString().trim()

        if (selectedText && selectedText.length > 0) {
          // Get selection position for toolbar
          const range = selection?.getRangeAt(0)
          const rect = range?.getBoundingClientRect()

          if (rect) {
            const anchor: SelectionAnchor = {
              x: rect.left + rect.width / 2,
              y: rect.top,
              rectRight: rect.right,
              mouseX: e.clientX,
              mouseY: e.clientY
            }

            const context: SelectionContext = {
              text: selectedText,
              title: document.title || "",
              url: window.location.href
            }

            openToolbar(context, anchor)
          }
        } else {
          // Check if click was outside toolbar area
          const target = e.target as HTMLElement
          if (!target.closest('[data-aiction-root="true"]')) {
            closeToolbar()
          }
        }
      }, 100)
    }

    const handleMouseDown = (e: MouseEvent) => {
      // Don't close toolbar if clicking inside extension UI
      const target = e.target as HTMLElement
      if (target.closest('[data-aiction-root="true"]')) {
        return
      }
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)

    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
      if (selectionTimeout) clearTimeout(selectionTimeout)
    }
  }, [openToolbar, closeToolbar])

  // Handle action
  const handleAction = useCallback(
    async (template: string, text: string) => {
      if (!selectionContext) {
        return
      }

      const settings = await getSettings()
      const context = { ...selectionContext, text }
      const prompt = resolveActionTemplate(template, context, settings)

      // 防抖：存在解析出相同 prompt 的未关闭会话（同动作同选区重复点击）时忽略；
      // 相应会话被关闭后才重新响应；钉住的会话继续驻留，其它动作正常弹出新实例
      if (hasSessionForPrompt(prompt)) {
        return
      }

      const matchedAction = settings.actions.find((a) => a.template === template)
      const BUILTIN_IDS = new Set(["explain", "translate"])
      const customActions = settings.actions.filter((a) => !BUILTIN_IDS.has(a.id))
      void trackEvent("action_clicked", {
        action_id: matchedAction?.id ?? "unknown",
        action_label: matchedAction?.label ?? "unknown",
        custom_action_count: customActions.length,
        custom_action_labels: customActions.map((a) => a.label).join(",")
      })

      // 每次触发均追加独立会话实例（与既有实例并存，钉住的不会被替换）
      openSession({
        anchor: takeToolbarAnchor(),
        capturedText: text,
        context,
        initialPrompt: prompt
      })
    },
    [selectionContext, hasSessionForPrompt, openSession, takeToolbarAnchor]
  )

  // Handle quick action
  const handleQuickAction = useCallback(
    async (action: QuickAction) => {
      if (!selectionContext) return

      const text = selectionContext.text

      if (action.type === "copyToClipboard") {
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          const textarea = document.createElement("textarea")
          textarea.value = text
          textarea.style.position = "fixed"
          textarea.style.opacity = "0"
          document.body.appendChild(textarea)
          textarea.select()
          document.execCommand("copy")
          document.body.removeChild(textarea)
        }
        closeToolbar()
      }

      void trackEvent("quick_action_clicked", { action_type: action.type })
    },
    [selectionContext, closeToolbar]
  )

  // Handle free submit from panel captured text
  // （与 action 同路径：自由输入解析出的 prompt 相同且会话仍开着同样防抖）
  const handleFreeSubmit = useCallback(
    async (input: string, text: string) => {
      if (!selectionContext) {
        return
      }

      void trackEvent("free_input_submitted", { input_length: input.length })

      const context = { ...selectionContext, text }
      const prompt = formatFreeInputPrompt(input, text)
      // 防抖：与 handleAction 同规则（钉住的会话也不阻断新触发，仅同 prompt 忽略）
      if (hasSessionForPrompt(prompt)) {
        return
      }

      // 多实例并存：钉住的会话不会被替换，自由输入也弹出新实例
      openSession({
        anchor: takeToolbarAnchor(),
        capturedText: text,
        context,
        initialPrompt: prompt
      })
    },
    [selectionContext, hasSessionForPrompt, openSession, takeToolbarAnchor]
  )

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <div style={{ fontSize: "18px", color: "#6B7280" }}>{t("pdf.loading")}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <div style={{ fontSize: "18px", color: "#EF4444" }}>{error}</div>
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: "#F8F9FA", minHeight: "100vh" }}>
      <div
        ref={extensionRootRef}
        data-aiction-root="true"
        style={{ pointerEvents: "none" }}>
        <SelectionToolbar
          visible={toolbarVisible}
          anchor={toolbarAnchor}
          selectionStart={null}
          actions={actions}
          quickActions={quickActions}
          onAction={(template, text) => {
            void handleAction(template, selectionContext?.text ?? text)
          }}
          onQuickAction={(action) => {
            void handleQuickAction(action)
          }}
          onClose={() => {
            closeToolbar()
          }}
          onRectChange={handleToolbarRectChange}
        />

        {/* 对话会话：多实例并存，逐个独立销毁（onClose/onPinnedChange 以 id 闭包捕获） */}
        {sessions.map((session) => (
          <ChatSession
            key={session.id}
            init={session}
            pinned={session.pinned}
            onPinnedChange={(pinned) => setSessionPinned(session.id, pinned)}
            onClose={() => closeSession(session.id)}
          />
        ))}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "20px",
          paddingTop: "80px"
        }}>
        {pdf &&
          Array.from({ length: numPages }, (_, i) => i + 1).map((pageNumber) => (
            <PdfPage key={pageNumber} pdf={pdf} pageNumber={pageNumber} scale={scale} />
          ))}
      </div>

      <style>{`
        .pdf-page {
          position: relative;
        }

        .textLayer {
          --csstools-color-scheme--light: initial;
          color-scheme: only light;
          position: absolute;
          text-align: initial;
          inset: 0;
          overflow: clip;
          opacity: 1;
          line-height: 1;
          -webkit-text-size-adjust: none;
          -moz-text-size-adjust: none;
          text-size-adjust: none;
          forced-color-adjust: none;
          transform-origin: 0 0;
          caret-color: CanvasText;
          z-index: 0;
          --min-font-size: 1;
          --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
          --min-font-size-inv: calc(1 / var(--min-font-size));
        }

        .textLayer :is(span, br) {
          color: transparent;
          position: absolute;
          white-space: pre;
          cursor: text;
          transform-origin: 0% 0%;
        }

        .textLayer > :not(.markedContent),
        .textLayer .markedContent span:not(.markedContent) {
          z-index: 1;
          --font-height: 0;
          font-size: calc(var(--text-scale-factor) * var(--font-height));
          --scale-x: 1;
          --rotate: 0deg;
          transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
        }

        .textLayer .markedContent {
          display: contents;
        }

        .textLayer span[role="img"] {
          -webkit-user-select: none;
          -moz-user-select: none;
          user-select: none;
          cursor: default;
        }

        .textLayer .highlight {
          --highlight-bg-color: rgb(180 0 170 / 0.25);
          --highlight-selected-bg-color: rgb(0 100 0 / 0.25);
          margin: -1px;
          padding: 1px;
          background-color: var(--highlight-bg-color);
          border-radius: 4px;
        }

        .textLayer .highlight.appended {
          position: initial;
        }

        .textLayer .highlight.begin {
          border-radius: 4px 0 0 4px;
        }

        .textLayer .highlight.end {
          border-radius: 0 4px 4px 0;
        }

        .textLayer .highlight.middle {
          border-radius: 0;
        }

        .textLayer .highlight.selected {
          background-color: var(--highlight-selected-bg-color);
        }

        .textLayer ::selection {
          background: rgba(0, 0, 255, 0.25);
          background: color-mix(in srgb, AccentColor, transparent 75%);
        }

        .textLayer ::-moz-selection {
          background: rgba(0, 0, 255, 0.25);
          background: color-mix(in srgb, AccentColor, transparent 75%);
        }

        .textLayer br::selection {
          background: transparent;
        }

        .textLayer br::-moz-selection {
          background: transparent;
        }

        .textLayer .endOfContent {
          display: block;
          position: absolute;
          inset: 100% 0 0;
          z-index: 0;
          cursor: default;
          -webkit-user-select: none;
          -moz-user-select: none;
          user-select: none;
        }

        .textLayer .endOfContent.active {
          top: 0;
        }

        .textLayer.selecting .endOfContent {
          top: 0;
        }
      `}</style>
    </div>
  )
}
