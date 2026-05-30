import React from "react"
import ReactDOM from "react-dom/client"

import Popup from "@/entrypoints/popup/Popup"
import { I18nRoot } from "@/shared/i18n/root"

const root = ReactDOM.createRoot(document.getElementById("root")!)
root.render(
  <I18nRoot>
    <Popup />
  </I18nRoot>
)
