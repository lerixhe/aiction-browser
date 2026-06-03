# AIction

> English | **[中文](./README.zh-CN.md)**

A lightweight Chrome extension (MV3) for getting AI help on selected web content.

Select text on any page, trigger AI actions from an inline toolbar, and continue the conversation in a floating chat panel. Supports any OpenAI-compatible `/chat/completions` endpoint.

## Features

- **Inline AI Toolbar** — Select text and instantly trigger AI actions via a toolbar
- **Floating Chat Panel** — Continue the conversation in a draggable, resizable panel with streaming responses
- **Custom Actions** — Create your own prompt templates with `{text}` placeholders
- **Multi-Provider Support** — OpenAI, Anthropic, Google, DeepSeek, OpenRouter, or any OpenAI-compatible API
- **Reasoning Display** — View model thinking process (supports `reasoning_content` from DeepSeek, etc.)
- **Dark Mode** — Auto / Light / Dark theme
- **PDF Viewer** — Built-in PDF viewer with AI assistance
- **Backup & Restore** — Export/import settings as JSON

## Screenshots

### Action Button Demo

![动作按钮演示](./docs/images/动作按钮演示.gif)

## Installation

### From Source (Development)

```bash
# Clone the repository
git clone <repo-url>
cd aiction

# Install dependencies (runs `wxt prepare` automatically)
npm install

# Start dev build (watches for changes)
npm run dev

# Build production version
npm run build
```

### Load Unpacked Extension

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the `.output/chrome-mv3` directory

## Quick Start

1. **Configure API** — Right-click the extension icon → Options, or open the Options page from `chrome://extensions`
2. **Add a Model Service** — Enter your API Base URL, API Key, and Model name
3. **Test Connection** — Click "Test Connection" to verify your setup
4. **Select Text** — Highlight any text on a web page
5. **Trigger AI** — Click the toolbar button that appears, then choose an action
6. **Chat** — Continue the conversation in the floating panel

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

### Custom Actions

Create custom prompt templates in the Options page. Use `{text}` as a placeholder for the selected text.

**Built-in actions:**

| Action | Template |
|--------|----------|
| Explain | `帮我解释选中内容「{text}」` |
| Translate | `请将以下内容翻译为简体中文：\n{text}` |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Chrome Extension (MV3)                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Content      │  │ Background   │  │ Options      │  │
│  │ Script       │  │ Service      │  │ Page         │  │
│  │              │  │ Worker       │  │              │  │
│  │ • Selection  │  │ • AI API     │  │ • Settings   │  │
│  │ • Toolbar    │  │ • Streaming  │  │ • Models     │  │
│  │ • Chat Panel │  │ • Storage    │  │ • Actions    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘  │
│         │                 │                             │
│         └── chrome.runtime.connect (streaming) ──┘      │
│         └── chrome.runtime.onMessage (one-shot) ──┘     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Shared Modules (src/shared)        │    │
│  │  types • storage • messaging • prompt • tokens  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Tech Stack

- **Build Tool**: [WXT](https://wxt.dev/)
- **UI**: React 19 + TypeScript
- **AI SDK**: Vercel AI SDK (`ai` package)
- **Manifest**: Chrome Manifest V3

### Directory Structure

```
src/
├── entrypoints/
│   ├── background.ts          # Background service worker
│   ├── content/
│   │   ├── index.tsx          # Content script entry (Shadow DOM UI)
│   │   ├── App.tsx            # Root React component
│   │   ├── components/        # SelectionToolbar, ChatWindow, etc.
│   │   └── hooks/             # useChatState, useDraggable, useSelectionDetection
│   ├── options/               # Options page
│   ├── popup/                 # Browser action popup
│   └── pdf-viewer/            # Built-in PDF viewer
├── shared/
│   ├── types.ts               # TypeScript interfaces
│   ├── storage.ts             # Chrome storage wrappers
│   ├── messaging.ts           # Port-based streaming helper
│   ├── prompt.ts              # Prompt template resolution
│   ├── constants.ts           # Message types, error strings
│   ├── defaults.ts            # Default settings & action presets
│   ├── errors.ts              # Error formatting
│   ├── model-provider.ts      # Multi-provider AI SDK resolution
│   ├── i18n/                  # Internationalization
│   └── ui/                    # Theme, icons, design tokens
└── assets/
    └── icon.png               # Extension icon source (>=256px)
```

## Development

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev build with file watching |
| `npm run dev:firefox` | Dev build for Firefox |
| `npm run build` | Production extension build |
| `npm run typecheck` | TypeScript type checking |
| `npm run zip` | Package extension bundle |

### Path Aliases

TypeScript path aliases: `~/*` and `@/*` both map to `src/*`

```typescript
import { useUiTheme } from "@/shared/ui/theme"
```

### After Making Changes

1. Run `npm run typecheck` and `npm run build`
2. Go to `chrome://extensions`
3. Click the reload button on your extension
4. **Reload the target web page** (existing tabs keep old content-script instances)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run typecheck` and `npm run build`
5. Test in Chrome
6. Submit a pull request

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.
