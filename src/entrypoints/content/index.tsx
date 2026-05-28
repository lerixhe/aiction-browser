import React from "react"
import ReactDOM from "react-dom/client"

import App from "@/entrypoints/content/App"

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: "aiction-ui",
      position: "inline",
      anchor: "body",
      onMount(container) {
        const app = document.createElement("div")
        container.append(app)

        const root = ReactDOM.createRoot(app)
        root.render(<App />)
        return root
      },
      onRemove(root) {
        root?.unmount()
      }
    })

    ui.mount()
  }
})
