import React from "react"
import ReactDOM from "react-dom/client"

import OptionsPage from "@/entrypoints/options/OptionsPage"
import { I18nRoot } from "@/shared/i18n/root"

const root = ReactDOM.createRoot(document.getElementById("root")!)
root.render(
  <I18nRoot>
    <OptionsPage />
  </I18nRoot>
)
