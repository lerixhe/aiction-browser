import React from "react"
import ReactDOM from "react-dom/client"

import { PdfViewerPage } from "@/entrypoints/pdf-viewer/PdfViewer"
import { I18nRoot } from "@/shared/i18n/root"

const root = ReactDOM.createRoot(document.getElementById("root")!)
root.render(
  <I18nRoot>
    <PdfViewerPage />
  </I18nRoot>
)
