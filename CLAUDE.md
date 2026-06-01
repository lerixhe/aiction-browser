# CLAUDE.md

## Project Overview
AIction is a Chrome MV3 extension built with **WXT + React + TypeScript**. Users select text on any web page, trigger AI actions from an inline toolbar, and continue the conversation in a floating chat panel. The AI backend uses an OpenAI-compatible `/chat/completions` endpoint.

## Commands
- `npm run dev` — WXT dev build with watch mode
- `npm run typecheck` — TypeScript check only (no emit)
- `npm run build` — Production extension build. **Run this after every code change.**
- `npm run package` — Zip the extension for distribution

## Architecture

### Four runtime contexts

| Context | Entry point | Key files |
|---------|-------------|-----------|
| **Content script UI** | `src/entrypoints/content/index.tsx` | `App.tsx`, `components/SelectionToolbar.tsx`, `components/ChatWindow.tsx` |
| **Background service worker** | `src/entrypoints/background.ts` | — |
| **Options page** | `src/entrypoints/options/` | `OptionsPage.tsx`, `ConfirmDialog.tsx` |
| **Popup** | `src/entrypoints/popup/` | `Popup.tsx` |

Shared logic lives in `src/shared/*`:
- `types.ts` — All TypeScript interfaces/types
- `selection.ts` — Text selection snapshot & anchor calculation
- `prompt.ts` — Prompt template resolution
- `messaging.ts` — `streamChat()` port-based streaming helper
- `storage.ts` — Chrome storage wrappers + settings normalization
- `constants.ts` — Message types, error strings
- `defaults.ts` — Default settings & action presets
- `errors.ts` — Error formatting utilities

### How communication works

1. Content script opens a `chrome.runtime.connect` port (`AICTION_STREAM`).
2. Background listens on `chrome.runtime.onConnect`, reads API settings, calls `fetch()` with streaming, and `port.postMessage`s events back.
3. For non-streaming requests (API test, fetch models), content/options uses `chrome.runtime.sendMessage` and background responds via `sendResponse`.

## Path aliases
`~/*` and `@/*` both resolve to `src/*` via tsconfig `paths`.

## Key invariants
- **Never call AI APIs directly from the content script.** All network requests must go through the background service worker.
- Keep `data-aiction-root="true"` on the extension UI root div — selection and mousedown handlers depend on ignoring events inside that subtree.
- The `ChatStreamStartRequest` / `ChatStreamEvent` types and `MESSAGE_TYPES` constants must stay in sync between background and content script.
- Custom action templates must contain `{text}` — validated before saving.
- Conversation history is **per-page, in-memory only**. Refresh or close clears it.

## Selection / toolbar pitfalls
- The content script UI runs inside a **Shadow DOM** (via `createShadowRootUi`). Do not rely on `document.activeElement` for focus checks; use deep active-element traversal through nested shadow roots.
- Use `event.composedPath()` instead of `event.target` for extension UI event filtering so Shadow DOM retargeting doesn't bypass root checks.
- Text selection inside toolbar/chat inputs must never update the page selection context, toolbar anchor, or toolbar visibility.
- Do not let transient page-selection loss during focus transfer into extension inputs hide the toolbar. Preserve that state during extension-internal interaction.
- When debugging selection bugs, reload the extension **and** refresh the target tab before assuming the logic is wrong. Stale injected code is a common cause.

## Manual verification
After `npm run build`, load `.output/chrome-mv3` in `chrome://extensions` as an unpacked extension. To see content-script changes, reload the extension **and** refresh the target tab (or close and reopen it). For background/service-worker changes, verify from the extension's service worker inspector.

## Icon generation

WXT reads `public/icon.png` and copies it to the output. **Source PNG should be ≥256px** to avoid upscaling artifacts.

Three files define the icon — keep them in sync:

| File | Role |
|------|------|
| `favicon.svg` | SVG source of truth (use `clipPath` for transparent rounded corners) |
| `src/shared/ui/icons.tsx` | `BrandIcon` React component (inline SVG, mirrors `favicon.svg`) |
| `public/icon.png` | High-res PNG rendered from SVG (256×256, sharp + lanczos3 downscale) |

### Steps to update the icon

1. Edit `favicon.svg` — this is the canonical SVG source.
2. Mirror the changes in `src/shared/ui/icons.tsx` (`BrandIcon` component).
3. Generate `public/icon.png` at 256×256 using sharp:

```js
// _genicon.js (temporary, delete after use)
const sharp = require('sharp');
const fs = require('fs');
const svg = fs.readFileSync('favicon.svg', 'utf8');
sharp(Buffer.from(svg), { density: 600 })
  .resize(256, 256, { kernel: 'lanczos3', fit: 'cover' })
  .png({ quality: 100 })
  .toFile('public/icon.png')
  .then(() => console.log('Done'));
```

```bash
node _genicon.js && rm _genicon.js
```

4. `npm run build` — WXT copies the icon to output.
5. Verify corners are transparent and edges are sharp.

### Notes
- Do **not** use `qlmanage` — it produces blurry low-quality output.
- Always render from SVG via sharp with `density: 600` for crisp edges.
- The SVG must use `clipPath` with a rounded rect (`rx="8"`) so PNG corners are transparent.
