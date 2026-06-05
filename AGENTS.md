# AGENTS.md

## Project Summary
Chrome extension (MV3) built with WXT + React + TypeScript. Users select text on any page, trigger AI actions from an inline toolbar, and continue conversation in a floating chat panel. AI backend uses an OpenAI-compatible `/chat/completions` endpoint via Vercel AI SDK. Supports i18n (English/Chinese), multiple AI providers via models.dev integration, and includes a built-in PDF viewer.

## Quick Facts
- Build framework: WXT (v0.20.26)
- TypeScript path alias: `~/*` and `@/*` map to `src/*` (tsconfig `paths`).
- WXT modules: `@wxt-dev/auto-icons` (auto-generates extension icons from `src/assets/icon.png`).
- AI SDK: Vercel AI SDK (`ai` package) for streaming/text generation in background.
- i18n: English/Chinese support via `src/shared/i18n/`.
- Provider logos: loaded from `models.dev` via `src/shared/models-dev.ts`.
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
- **Background** (`src/entrypoints/background.ts`): registers the message handler, reads settings from `chrome.storage.sync`, calls the API via `streamText()` / `generateText()` from Vercel AI SDK, normalizes responses. Also handles PDF viewer context menu and models.dev data fetching. **Never move API requests into the content script.**
- **Options** (`src/entrypoints/options/`): edits API config, translation language, and custom actions, then validates and persists settings.

### Communication flow
- **Streaming (chat):** Content script opens a `chrome.runtime.connect` port (`AICTION_STREAM`). Background listens on `chrome.runtime.onConnect`, calls `streamText()` with streaming, and `port.postMessage`s events back.
- **Non-streaming (API test, fetch models):** Uses `chrome.runtime.sendMessage` and background responds via `sendResponse`.

Shared logic in `src/shared/*`: `types.ts`, `selection.ts`, `prompt.ts`, `messaging.ts`, `storage.ts`, `constants.ts`, `defaults.ts`, `errors.ts`, `analytics.ts`, `model-provider.ts`, `models-dev.ts`, `iconify.tsx`.

Shared UI in `src/shared/ui/`: `tokens.ts`, `styles.ts`, `theme.ts`, `icons.tsx`, `iconify.tsx`, `markdown.tsx`, `toggle-switch.tsx`, `avatar.ts`, `bundled-icons.ts`, `icon-library.ts`.

Content script hooks in `src/entrypoints/content/hooks/`: `useChatState.ts`, `useDraggable.ts`, `useSelectionDetection.ts`, `useToolbarState.ts`.

### i18n System
- Translation files in `src/shared/i18n/` (English + Chinese).
- `I18nRoot` wraps the content script React tree; Options and Popup use `useI18n()` hook.
- All user-facing strings go through `t("key")` — never hardcode UI text.

### Models.dev Integration
- `src/shared/models-dev.ts` fetches provider metadata (name, logo, models) from `models.dev`.
- Background caches the data and serves it to Options/Popup via `AICTION_MODELS_DEV_REQUEST` message.
- Provider logos loaded dynamically: `https://models.dev/logos/{providerId}.svg`.
- Used in Options page provider selector and Popup provider dropdown.

### PDF Viewer
- `src/entrypoints/pdf-viewer/` — built-in PDF viewer page.
- Background registers a context menu "Open PDF with AIction" on PDF pages.
- Opens the PDF in a new tab with the extension's viewer, enabling text selection and AI actions on PDF content.

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

WXT reads `src/assets/icon.png` via `@wxt-dev/auto-icons` and copies it to the output. **Source PNG should be >=256px** to avoid upscaling artifacts.

Two files define the icon — keep them in sync:

| File | Role |
|------|------|
| `src/assets/icon.png` | High-res PNG source of truth (256x256, sharp + lanczos3 downscale) |
| `src/shared/ui/icons.tsx` | `BrandIcon` React component (renders `src/assets/icon.png`) |

### Steps to update the icon

1. Replace `src/assets/icon.png` with a new PNG (>=256px, transparent corners).
2. `npm run build` — WXT copies the icon to output.
3. Verify corners are transparent and edges are sharp.

### Notes
- Do **not** use `qlmanage` — it produces blurry low-quality output.
- Use sharp with `density: 600` for crisp edges when generating PNG from SVG.
- The PNG should have transparent corners (use `clipPath` with rounded rect if converting from SVG).

## Icon Caching System

Two-tier architecture for offline icon rendering and fast icon picker.

### Architecture

```
┌─────────────────────────────────────────────────────┐
│ Runtime Loading (iconify.tsx)                        │
│                                                     │
│ 1. addCollection(BUNDLED_TABLER_ICONS)  ← static    │
│    106 icons, zero network, instant                  │
│                                                     │
│ 2. First render: lazy load user icons                │
│    chrome.storage.sync.get("aiction:icons")          │
│    → addIcon() per icon                              │
│                                                     │
│ 3. User picks new icon → fetch SVG → saveUserIcon()  │
│    → addIcon() → persist to storage                  │
└─────────────────────────────────────────────────────┘
```

### Two Storage Tiers

| Tier | Location | Content | Update Trigger |
|------|----------|---------|----------------|
| **Built-in** | `src/shared/ui/bundled-icons.ts` (generated) | 104 default + 2 nav icons (106 total) | Manual: `npm run bundle-icons` |
| **User icons** | `chrome.storage.sync` → `aiction:icons` | User-selected icon SVG data | On icon pick or config import |

### Icon Data Format (IconifyJSON)

```typescript
{
  prefix: "tabler",
  icons: {
    "sparkles": { body: "<path fill='none'.../>" },
    "bulb": { body: "<g fill='none'...>...</g>" }
  },
  width: 24,
  height: 24
}
```

- `body`: SVG inner paths (no outer `<svg>` tag), ~100-400 bytes per icon
- `width/height`: viewport size (Tabler uses 24x24)

### Files

| File | Role |
|------|------|
| `scripts/bundle-icons.ts` | Build script: extracts 106 icons from `@iconify/json` → generates `bundled-icons.ts` |
| `src/shared/ui/bundled-icons.ts` | **Generated**: exports `BUNDLED_TABLER_ICONS` (IconifyJSON, ~22KB) |
| `src/shared/ui/iconify.tsx` | Calls `addCollection()` at module load; lazy loads user icons on first render |
| `src/shared/storage.ts` | `getUserIcons()`, `saveUserIcon()`, `loadAndRegisterUserIcons()` |
| `src/shared/types.ts` | `UserIconData` interface |

### Commands

- `npm run bundle-icons` — regenerate `bundled-icons.ts` from `@iconify/json` (manual, not auto)
- `npm run build` — runs `bundle-icons` automatically before WXT build

### Icon Selection Flow (OptionsPage)

When user picks an icon:

1. Check if icon is in built-in set (`BUNDLED_TABLER_ICONS.icons`)
2. **If built-in**: copy body from `BUNDLED_TABLER_ICONS` → `saveUserIcon()`
3. **If not built-in**: fetch from `api.iconify.design` → parse SVG body → `saveUserIcon()` + `addIcon()`
4. Save settings with icon name string

**Important**: `handleIconSelect` is async — always `await` it before saving settings.

### Export/Import

**Export** (`handleExportSettings`):
```json
{
  "app": "aiction",
  "version": 1,
  "exportedAt": "...",
  "settings": { ... },
  "userIcons": { "tabler:sparkles": { "body": "...", "width": 24, "height": 24 } }
}
```

**Import** (`confirmImportSettings`):
1. Parse JSON → extract `settings` and `userIcons`
2. `normalizeSettings(settings)` → save
3. For each user icon: `saveUserIcon(name, data)` → persist to `chrome.storage.sync`

### Size Budget

| Item | Size |
|------|------|
| Built-in icons (106) | ~22KB raw / ~8KB gzip |
| Per user icon | ~200B |
| User icons cap (50) | ~10KB (well under `chrome.storage.sync` 100KB limit) |

### Dependencies

- `@iconify/json` (devDependency) — full Tabler icon set JSON for build script
- `@iconify/react` (dependency) — `addCollection()`, `addIcon()`, `Icon` component
- `tsx` (devDependency) — runs `scripts/bundle-icons.ts`

## Reference Projects

`reference/` contains two similar Chrome extension projects for reference. See `reference/README.md`.

When unsure about implementation patterns (component structure, messaging, UI approach, etc.), check these projects first.
