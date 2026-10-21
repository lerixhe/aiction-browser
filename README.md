# AIction Browser

> Select text → Trigger AI → Continue in chat

A lightweight Chrome extension for getting AI help on selected web content: select text, pick an action from the toolbar, read the streamed answer, then keep asking in a floating panel. Works with any endpoint that follows the OpenAI chat completions format — your key, your model, your bill.

> 🛒 **Available on the Chrome Web Store:**
> **[Install AIction from Chrome Web Store](https://chromewebstore.google.com/detail/aiction-custom-ai-actions/heedegdamjmjffdojaihadbndemmocin?utm_source=github)**

> ⚠️ **Note**: This is the browser extension component. For the desktop app, see [AIction Desktop](https://github.com/lerixhe/aiction).

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-yellow)](https://chromewebstore.google.com/detail/aiction-custom-ai-actions/heedegdamjmjffdojaihadbndemmocin)
[![Version](https://img.shields.io/github/package-json/v/lerixhe/aiction-browser/master?label=version)](package.json)
[![Languages](https://img.shields.io/badge/i18n-7%20languages-blue)](src/shared/i18n/registry.ts)

**[中文](./README.zh-CN.md)**

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="store/screenshots/01-select-toolbar.png" alt="Inline toolbar after selecting text" /></td>
    <td width="50%"><img src="store/screenshots/02-instant-answer.png" alt="Streamed answer in the floating card" /></td>
  </tr>
  <tr>
    <td width="50%"><img src="store/screenshots/03-follow-up-chat.png" alt="Follow-up chat in dark theme" /></td>
    <td width="50%"><img src="store/screenshots/04-custom-actions.png" alt="Custom actions in the settings page" /></td>
  </tr>
</table>

## Features

### Inline action toolbar

Select text on any page and a small toolbar appears next to it, with your actions plus one-click **copy** and **read aloud**.

### Floating chat panels

The answer streams into a compact card; switch it to chat mode when you want to keep asking. Panels are draggable, pinnable, and several can stay open on the same page — sessions are per-page and in memory, gone when you close or reload the tab.

### Actions you define

Every toolbar button is a prompt template. Write `{selection}` wherever the selected text should appear, then change the name, icon, template, order or visibility. Two actions are built in:

| Action | What it does |
|--------|--------------|
| Explain | Explains the selection: conclusion first, no restating the text, length matched to the complexity of the content |
| Translate | Auto-directional Chinese ↔ English: mainly-English → Simplified Chinese, mainly-Chinese → English; translation only, original formatting kept |

### Bring your own model

Add as many providers as you like — OpenAI, Anthropic, Google, DeepSeek, OpenRouter, or a custom gateway — then switch between them from the toolbar popup without leaving the page. Provider presets come from [models.dev](https://models.dev): leave the endpoint empty and the provider's default is used, fetch the model list with one click, and fill reasoning mode / effort with **Smart Fill Params**.

### Model parameters

Nothing is sent unless you fill it in — an empty field means "endpoint / model default", never a value we invented.

| Parameter | Sent as | Empty means |
|-----------|---------|-------------|
| Max output tokens | `max_tokens` | Use the endpoint default |
| Context truncation threshold | Applied locally (characters) | No truncation |
| Reasoning mode | On / off, mapped per provider | Follow the model default |
| Reasoning effort | `low` / `medium` / `high` | Not sent |

Output and context limits differ per provider copy of the same model, so the numbers from the data source are shown as hints only — the endpoint's own limit wins.

### Read the selection aloud

Text-to-speech with Edge online voices or the system voice, adjustable speed, and automatic voice matching based on the detected language of the text.

### Also included

- Visible reasoning output — the thinking process is shown whenever the endpoint streams it
- Dark / light / auto theme, 7 interface languages: English, 日本語, 한국어, Русский, Tiếng Việt, 简体中文, 繁體中文 (follows the browser by default)
- Built-in PDF viewer — selection, actions and chat work inside PDFs
- Editable system prompt with `{selection}`, `{pageTitle}`, `{pageUrl}`, `{metaDescription}`, `{surround}` and `{uiLanguage}` placeholders
- Export / import the whole configuration as JSON, custom icons included

## Install

**Chrome Web Store** (recommended)

[Install from Chrome Web Store](https://chromewebstore.google.com/detail/aiction-custom-ai-actions/heedegdamjmjffdojaihadbndemmocin)

**Developer Mode**

```bash
git clone https://github.com/lerixhe/aiction-browser.git
cd aiction-browser
npm install
npm run dev
```

Then:
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `.output/chrome-mv3` directory

## Quick Start

1. Right-click the extension icon → **Options**
2. Add a provider (endpoint + key + model — or pick a preset, leave the endpoint empty and let `models.dev` supply the provider default)
3. Click "Test Connection"
4. Select text on any page → pick an action on the toolbar → keep asking in the panel

## Configuration

### Provider

| Field | Description | Example |
|-------|-------------|---------|
| Endpoint URL | OpenAI-compatible base URL, `/v1` included | `https://api.openai.com/v1` |
| API Key | Kept in this browser's synced storage only | `sk-...` |
| Model | Model ID actually sent to the endpoint | `gpt-4o-mini` |

### Other settings

| Section | What it controls |
|---------|------------------|
| Appearance | Theme and interface language |
| API Providers | Endpoints, keys, model and parameters |
| AI Actions | Built-in and custom actions, toolbar quick actions, speech settings |
| System Prompt | The instruction sent with every request; empty falls back to the built-in template |
| Backup & Migration | JSON export / import |
| About | Version, telemetry switch |

## Privacy

Selected text, page content and AI replies go straight from your browser to the endpoint you configured — they never reach our servers. There is no account system and we never see your API key. Anonymous usage statistics (feature counts, response latency) can be turned off in Settings → About. See [docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md).

## Architecture

Three runtime contexts, talking only through messages — **AI requests are made in the background only**:

```
Content script  (selection detection, toolbar, chat panels)
    │  chrome.runtime.connect — AICTION_STREAM port (streamed events)
    ▼
Background      (the only place that calls AI endpoints; models.dev cache; PDF context menu)
    │  chrome.runtime.sendMessage (one-shot: connection test, model lists)
    ▼
Options / Popup / PDF viewer
```

Popup can also ask the content script to open a blank panel in the current tab (`AICTION_OPEN_CHAT`), so the question starts on the page rather than in the popup.

Architecture & dev guide: [AGENTS.md](AGENTS.md) · Docs index: [docs/README.md](docs/README.md)

## Tech Stack

- [WXT](https://wxt.dev/) — build framework
- React 19 + TypeScript
- [Vercel AI SDK](https://sdk.vercel.ai/) — streaming AI calls
- Chrome Manifest V3

## Development

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev build with file watching |
| `npm run dev:firefox` | Dev build for Firefox |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript type checking |
| `npm run check:i18n` | Verify every locale dictionary matches the `en` key set |
| `npm run zip` | Package the extension bundle |
| `npm run screenshots` / `screenshots:frame` | Re-shoot / re-frame the store screenshots |
| `npm run icons` | Regenerate extension icons from `logo_raw.jpg` |

### Path Aliases

`~/*` and `@/*` both map to `src/*`:

```typescript
import { useUiTheme } from "@/shared/ui/theme"
```

### i18n

`src/shared/i18n/registry.ts` is the single source of truth: the `Locale` type, validation, the language dropdown and prompt display names are all derived from it. Dictionaries in `src/shared/i18n/locales/` are type-checked against the `en` key set, so a missing, extra or misspelled key is a compile error. Adding a language takes three files (a dictionary, `public/_locales/<id>/messages.json`, one row in the registry) — see [AGENTS.md](AGENTS.md).

### After Making Changes

1. Run `npm run typecheck` and `npm run build` (add `npm run check:i18n` if you touched translations)
2. Go to `chrome://extensions`
3. Click the reload button on your extension
4. Reload the target web page — stale content scripts from the old build otherwise linger

## Contributing

1. Fork the repository
2. Create a branch: `git checkout -b feature/xxx`
3. Make your changes
4. Run `npm run typecheck` and `npm run build`
5. Test in Chrome
6. Submit a pull request

## License

[GPL-3.0](LICENSE)
