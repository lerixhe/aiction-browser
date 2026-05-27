# AGENTS.md

## Project Summary
Chrome extension (MV3) built with Plasmo + React + TypeScript. Users select text on any page, trigger AI actions from an inline toolbar, and continue conversation in a floating chat panel. AI backend uses an OpenAI-compatible `/chat/completions` endpoint.

## Quick Facts
- No lint or test setup. Use `npm run typecheck` and `npm run build` for verification.
- Build may warn about missing `svgo` for `htmlnano minifySvg`; builds still succeed.
- TypeScript path alias: `~/*` maps to `src/*` (tsconfig `paths`).
- Detailed architecture docs: `docs/WIKI.md`.

## Commands
- `npm run dev`: Plasmo dev build/watch.
- `npm run typecheck`: TypeScript only, no emit.
- `npm run build`: production extension build. Run this after code changes.
- `npm run package`: package the extension bundle.

## Entry Points
- `src/contents/main.tsx`: content-script UI entry (must be default-exported React component for Plasmo).
- `background.ts`: thin entry; calls `setupBackgroundMessageHandler()` from `src/background/index.ts`.
- `options.tsx`: thin entry; re-exports from `src/options/index.tsx`.
- `popup.tsx`: browser action popup (service switcher + open settings). Direct React component, no wrapper.

## Architecture
Three runtime contexts communicate via `chrome.runtime.onMessage`:

- **Content script** (`src/contents/main.tsx`): detects selection from range/input/textarea, computes toolbar anchor, renders `SelectionToolbar` and `UnifiedPanel`, stores per-page conversation state in React.
- **Background** (`src/background/index.ts` via `background.ts`): registers the message handler, reads settings from `chrome.storage.sync`, calls the API, normalizes responses. **Never move API requests into the content script.**
- **Options** (`src/options/index.tsx` via `options.tsx`): edits API config, translation language, and custom actions, then validates and persists settings.

Shared logic in `src/shared/*`: `types.ts`, `selection.ts`, `prompt.ts`, `messaging.ts`, `storage.ts`, `constants.ts`, `defaults.ts`, `errors.ts`.

## Invariants
- Keep `data-aiction-root="true"` on the extension UI root. Selection and mousedown handlers depend on ignoring events inside that subtree.
- Keep the background message listener registered at module load time.
- Keep AI requests in the background context; content script should only message background.
- Preserve `{text}` placeholder validation for custom actions before saving.
- Conversation is intentionally per-page in-memory only; refresh/close clears it.

## Selection UI Pitfalls
- Plasmo content-script UI runs inside Shadow DOM. Do not rely on `document.activeElement` alone; use deep active-element traversal through nested `shadowRoot` boundaries.
- Use `event.composedPath()` instead of `event.target` for extension UI event filtering so Shadow DOM retargeting doesn't bypass root checks.
- Text selection inside toolbar/chat inputs must never update page selection context, toolbar anchor, or toolbar visibility.
- Do not let transient page-selection loss during focus transfer into extension inputs hide the toolbar. Preserve that state during extension-internal interaction.
- When debugging selection bugs, reload the extension and refresh the target tab before assuming logic is wrong. Stale injected code is a common cause.

## Manual Verification
- After `npm run build`, load `build/chrome-mv3-prod` in `chrome://extensions` as an unpacked extension.
- After reloading the extension, reload the target web page. Existing tabs keep old content-script instances.
- If a content-script change still doesn't appear after extension + page reload, close and reopen the tab.
- For background/service-worker changes, verify from the extension's service worker inspector.

## Icon Generation Workflow

Plasmo reads `assets/icon.png` and auto-generates 16/32/48/64/128px icons. **Source PNG must be ≥256px** to avoid upscaling artifacts.

Three files define the icon — keep them in sync:

| File | Role |
|------|------|
| `favicon.svg` | SVG source of truth (use `clipPath` for transparent rounded corners) |
| `src/shared/ui/icons.tsx` | `BrandIcon` React component (inline SVG, mirrors `favicon.svg`) |
| `assets/icon.png` | High-res PNG rendered from SVG (256×256, sharp + lanczos3 downscale) |

### Steps to update the icon

1. Edit `favicon.svg` — this is the canonical SVG source.
2. Mirror the changes in `src/shared/ui/icons.tsx` (`BrandIcon` component).
3. Generate `assets/icon.png` at 256×256 using sharp (available via Plasmo dependency):

```js
// _genicon.js (temporary, delete after use)
const sharp = require('sharp');
const fs = require('fs');
const svg = fs.readFileSync('favicon.svg', 'utf8');
sharp(Buffer.from(svg), { density: 600 })
  .resize(256, 256, { kernel: 'lanczos3', fit: 'cover' })
  .png({ quality: 100 })
  .toFile('assets/icon.png')
  .then(() => console.log('Done'));
```

```bash
node _genicon.js && rm _genicon.js
```

4. `npm run build` — Plasmo auto-generates all sizes from the 256px source.
5. Verify corners are transparent and edges are sharp.

### Notes
- Do **not** use `qlmanage` — it produces blurry low-quality output.
- Always render from SVG via sharp with `density: 600` for crisp edges.
- The SVG must use `clipPath` with a rounded rect (`rx="8"`) so PNG corners are transparent.
