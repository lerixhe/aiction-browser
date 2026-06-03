# AIction

> Select text → Trigger AI → Continue in chat

A lightweight Chrome extension for getting AI help on selected web content. Supports any OpenAI-compatible `/chat/completions` endpoint.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-yellow)](https://chromewebstore.google.com/detail/YOUR_EXTENSION_ID)
[![Version](https://img.shields.io/badge/version-0.1.0-green)](package.json)

**[中文](./README.zh-CN.md)**

## Features

**Inline AI Toolbar**

Select text on any page, a toolbar appears with configurable actions.

![Action Button Demo](./docs/images/动作按钮演示.gif)

**Floating Chat Panel**

Continue the conversation in a draggable, resizable panel with streaming responses.

**Custom Actions**

Create your own prompt templates with `{text}` placeholders. Built-in actions:

| Action | Template |
|--------|----------|
| Explain | `Explain the selected content: "{text}"` |
| Translate | `Translate the following to English:\n{text}` |

**Multi-Provider Support**

OpenAI, Anthropic Claude, Google Gemini, DeepSeek, OpenRouter, or any OpenAI-compatible API.

**Other Features**

- Reasoning display — view model thinking process (DeepSeek `reasoning_content`, etc.)
- Dark mode — auto / light / dark theme
- PDF viewer — built-in PDF viewer with AI assistance
- Backup & restore — export/import settings as JSON

## Install

**Chrome Web Store** (recommended)

[Install from Chrome Web Store](YOUR_CHROME_WEBSTORE_LINK)

**Developer Mode**

```bash
git clone https://github.com/YOUR_USERNAME/aiction.git
cd aiction
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
2. Add a model service (API URL + Key + Model)
3. Click "Test Connection"
4. Select text on any page → click the toolbar → choose an action

## Configuration

### Model Service

| Field | Description | Example |
|-------|-------------|---------|
| API Base URL | OpenAI-compatible endpoint | `https://api.openai.com/v1` |
| API Key | Your API key | `sk-...` |
| Model | Model identifier | `gpt-4o-mini` |

### Model Parameters

| Parameter | Default | Range |
|-----------|---------|-------|
| Max Tokens | 1024 | 1 - 32768 |
| Temperature | 0.3 | 0 - 2 |
| Top P | 0.9 | 0 - 1 |
| Presence Penalty | 0 | -2 - 2 |
| Frequency Penalty | 0 | -2 - 2 |

## Architecture

```
Content Script (selection, toolbar, chat panel)
    ↓ chrome.runtime.connect (streaming)
Background (AI API, storage)
    ↓ chrome.runtime.sendMessage (one-shot)
Options (settings, models, actions)
```

Detailed architecture: [docs/WIKI.md](docs/WIKI.md)

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
| `npm run zip` | Package extension bundle |

### Path Aliases

`~/*` and `@/*` both map to `src/*`:

```typescript
import { useUiTheme } from "@/shared/ui/theme"
```

### After Making Changes

1. Run `npm run typecheck` and `npm run build`
2. Go to `chrome://extensions`
3. Click the reload button on your extension
4. Reload the target web page

## Contributing

1. Fork the repository
2. Create a branch: `git checkout -b feature/xxx`
3. Make your changes
4. Run `npm run typecheck` and `npm run build`
5. Test in Chrome
6. Submit a pull request

## License

[GPL-3.0](LICENSE)
