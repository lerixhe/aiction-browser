import { useCallback, useEffect, useRef, useState } from "react"
import * as pdfjsLib from "pdfjs-dist"

import SelectionToolbar from "@/entrypoints/content/components/SelectionToolbar"
import ChatWindow from "@/entrypoints/content/components/ChatWindow"
import { useChatState } from "@/entrypoints/content/hooks/useChatState"
import { useToolbarState } from "@/entrypoints/content/hooks/useToolbarState"
import { initContentScriptAnalytics, trackEvent } from "@/shared/analytics"
import { resolveActionTemplate, formatFreeInputPrompt } from "@/shared/prompt"
import { getSettings } from "@/shared/storage"
import { useI18n } from "@/shared/i18n/context"
import type { SelectionAnchor, SelectionContext } from "@/shared/types"

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
    toolbarMode,
    closeToolbar,
    openToolbar,
    toolbarVisibleRef
  } = useToolbarState()

  // Use chat state hook
  const {
    messages,
    requestState,
    panelOpen,
    setPanelOpen,
    capturedText,
    setCapturedText,
    setContext,
    sendPrompt,
    stopStreaming,
    resetMessages
  } = useChatState()

  // Custom selection detection for PDF text layer
  useEffect(() => {
    let selectionTimeout: ReturnType<typeof setTimeout> | null = null

    const handleMouseUp = (e: MouseEvent) => {
      // Don't process if panel is open
      if (panelOpen) return

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
            void trackEvent("selection_detected", { text_length: selectedText.length })
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
  }, [panelOpen, openToolbar, closeToolbar])

  // Run prompt with selection context
  const runWithSelectionContext = useCallback(
    async (rawPrompt: string, ctx: SelectionContext) => {
      await sendPrompt(rawPrompt, ctx)
    },
    [sendPrompt]
  )

  // Open unified panel with selection text and fire action
  const openPanelWithAction = useCallback(
    async (text: string, prompt: string) => {
      setCapturedText(text)
      setPanelOpen(true)
      closeToolbar()
      resetMessages()

      void trackEvent("panel_opened")

      if (selectionContext) {
        const ctx = { ...selectionContext, text }
        setContext(ctx)
        await runWithSelectionContext(prompt, ctx)
      }
    },
    [selectionContext, setCapturedText, setPanelOpen, closeToolbar, setContext, runWithSelectionContext, resetMessages]
  )

  // Handle action
  const handleAction = useCallback(
    async (template: string, text: string) => {
      if (!selectionContext) {
        return
      }

      const settings = await getSettings()
      const context = { ...selectionContext, text }
      const prompt = resolveActionTemplate(template, context, settings)

      const matchedAction = settings.actions.find((a) => a.template === template)
      void trackEvent("action_clicked", {
        action_id: matchedAction?.id ?? "unknown",
        action_label: matchedAction?.label ?? "unknown"
      })

      await openPanelWithAction(text, prompt)
    },
    [selectionContext, openPanelWithAction]
  )

  // Handle free submit from panel captured text
  const handleFreeSubmit = useCallback(
    async (input: string, text: string) => {
      if (!selectionContext) {
        return
      }

      void trackEvent("free_input_submitted", { input_length: input.length })

      const prompt = formatFreeInputPrompt(input, text)
      await openPanelWithAction(text, prompt)
    },
    [selectionContext, openPanelWithAction]
  )

  // Handle followup send from panel input
  const handleFollowupSend = useCallback(
    async (input: string) => {
      void trackEvent("followup_sent", { input_length: input.length, message_count: messages.length })
      await sendPrompt(input)
    },
    [sendPrompt, messages.length]
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
          actions={actions}
          toolbarMode={toolbarMode}
          onAction={(template, text) => {
            void handleAction(template, selectionContext?.text ?? text)
          }}
          onClose={() => {
            closeToolbar()
          }}
        />

        {panelOpen && (
          <ChatWindow
            capturedText={capturedText}
            messages={messages}
            requestState={requestState.status}
            onCapturedTextChange={setCapturedText}
            onSend={(input) => {
              void handleFollowupSend(input)
            }}
            onStop={stopStreaming}
            onClose={() => {
              setPanelOpen(false)
              setCapturedText("")
              setContext(null)
            }}
          />
        )}
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
