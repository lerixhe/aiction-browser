# AGENTS.md

## Project Summary
Chrome extension (MV3) built with WXT + React + TypeScript. Users select text on any page, trigger AI actions from an inline toolbar, and continue conversation in a floating chat panel. AI backend uses an OpenAI-compatible `/chat/completions` endpoint.

## Quick Facts
- Build framework: WXT (v0.20.26)
- TypeScript path alias: `~/*` and `@/*` map to `src/*` (tsconfig `paths`).
- WXT modules: `@wxt-dev/auto-icons` (auto-generates extension icons from `src/assets/icon.png`).
- Detailed architecture docs: `docs/WIKI.md`.

## Commands
- `npm run dev`: WXT dev build/watch (Chrome). Use `npm run dev:firefox` for Firefox.
- `npm run typecheck`: TypeScript only, no emit.
- `npm run build`: production extension build. Run this after code changes.
- `npm run zip`: zip the extension bundle.
- `npm run postinstall`: runs `wxt prepare` automatically after `npm install`.

## Workflow Rules
- **代码修改后必须验证**：每次修改代码后，必须主动运行 `npm run typecheck` 和 `npm run build`，确保类型正确且构建成功。不要等待用户手动执行。

## Entry Points (WXT file-based routing)
- `src/entrypoints/background.ts`: Background Service Worker (uses `defineBackground()`).
- `src/entrypoints/content/index.tsx`: Content Script UI (uses `defineContentScript()` + `createShadowRootUi()`).
- `src/entrypoints/options/`: Options Page (HTML entry + React component).
- `src/entrypoints/popup/`: Browser Action Popup (HTML entry + React component).
- `src/entrypoints/pdf-viewer/`: PDF Viewer Page (HTML entry + React component).

## Architecture
Three runtime contexts communicate via `chrome.runtime.onMessage` and `chrome.runtime.connect`:

- **Content script** (`src/entrypoints/content/`): detects selection from range/input/textarea, computes toolbar anchor, renders `SelectionToolbar` and `ChatWindow` (draggable), stores per-page conversation state in React.
- **Background** (`src/entrypoints/background.ts`): registers the message handler, reads settings from `chrome.storage.sync`, calls the API, normalizes responses. **Never move API requests into the content script.**
- **Options** (`src/entrypoints/options/`): edits API config, translation language, and custom actions, then validates and persists settings.

### Communication flow
- **Streaming (chat):** Content script opens a `chrome.runtime.connect` port (`AICTION_STREAM`). Background listens on `chrome.runtime.onConnect`, calls `fetch()` with streaming, and `port.postMessage`s events back.
- **Non-streaming (API test, fetch models):** Uses `chrome.runtime.sendMessage` and background responds via `sendResponse`.

Shared logic in `src/shared/*`: `types.ts`, `selection.ts`, `prompt.ts`, `messaging.ts`, `storage.ts`, `constants.ts`, `defaults.ts`, `errors.ts`, `iconify.tsx`.

Content script hooks in `src/entrypoints/content/hooks/`: `useChatState.ts`, `useDraggable.ts`, `useSelectionDetection.ts`, `useToolbarState.ts`.

## Invariants
- Keep `data-aiction-root="true"` on the extension UI root. Selection and mousedown handlers depend on ignoring events inside that subtree.
- Keep the background message listener registered at module load time.
- Keep AI requests in the background context; content script should only message background.
- Preserve `{text}` placeholder validation for custom actions before saving.
- Conversation is intentionally per-page in-memory only; refresh/close clears it.

## Selection UI Pitfalls
- WXT content-script UI runs inside Shadow DOM. Do not rely on `document.activeElement` alone; use deep active-element traversal through nested `shadowRoot` boundaries.
- Use `event.composedPath()` instead of `event.target` for extension UI event filtering so Shadow DOM retargeting doesn't bypass root checks.
- Text selection inside toolbar/chat inputs must never update page selection context, toolbar anchor, or toolbar visibility.
- Do not let transient page-selection loss during focus transfer into extension inputs hide the toolbar. Preserve that state during extension-internal interaction.
- When debugging selection bugs, reload the extension and refresh the target tab before assuming logic is wrong. Stale injected code is a common cause.

## Manual Verification
- After `npm run build`, load `.output/chrome-mv3` in `chrome://extensions` as an unpacked extension.
- After reloading the extension, reload the target web page. Existing tabs keep old content-script instances.
- If a content-script change still doesn't appear after extension + page reload, close and reopen the tab.
- For background/service-worker changes, verify from the extension's service worker inspector.

## Icon Generation Workflow

WXT reads `public/icon.png` and copies it to the output. **Source PNG should be ≥256px** to avoid upscaling artifacts.

Two files define the icon — keep them in sync:

| File | Role |
|------|------|
| `src/assets/icon.png` | High-res PNG source of truth (256×256, sharp + lanczos3 downscale) |
| `src/shared/ui/icons.tsx` | `BrandIcon` React component (renders `src/assets/icon.png`) |

### Steps to update the icon

1. Replace `src/assets/icon.png` with a new PNG (≥256px, transparent corners).
2. `npm run build` — WXT copies the icon to output.
3. Verify corners are transparent and edges are sharp.

### Notes
- Do **not** use `qlmanage` — it produces blurry low-quality output.
- Use sharp with `density: 600` for crisp edges when generating PNG from SVG.
- The PNG should have transparent corners (use `clipPath` with rounded rect if converting from SVG).

## Reference Projects

`reference/` 文件夹下有两个同类 Chrome 扩展项目，详见 `reference/README.md`。

遇到不确定的实现方案（组件结构、消息通信、UI 方案等）时，优先参考这两个项目。
