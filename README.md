# AIction

> English | **[中文](./README.zh-CN.md)**

A lightweight Chrome extension (MV3) for getting AI help on selected web content.

Select text on any page, trigger AI actions from an inline toolbar, and continue the conversation in a floating chat panel. Supports any OpenAI-compatible `/chat/completions` endpoint.

## Features

- **Inline AI Toolbar** — Select text and instantly trigger AI actions via an exploded ring menu or pill toolbar
- **Floating Chat Panel** — Continue the conversation in a draggable, resizable panel with streaming responses
- **Custom Actions** — Create your own prompt templates with `{text}` placeholders
- **Multi-Model Support** — Connect to OpenAI, DeepSeek, or any OpenAI-compatible API
- **Reasoning Display** — View model thinking process (supports `reasoning_content` from DeepSeek, etc.)
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

# Install dependencies
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
5. Select the `build/chrome-mv3-prod` directory

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
│         └──── chrome.runtime.onMessage ────┘            │
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
- **UI**: React 18 + TypeScript
- **Manifest**: Chrome Manifest V3

### Directory Structure

```
aiction/
├── background.ts          # Background entry (thin wrapper)
├── options.tsx            # Options page entry (thin wrapper)
├── popup.tsx              # Browser action popup
├── contents/
│   └── main.tsx           # Content script entry (WXT defineContentScript)
├── src/
│   ├── background/        # Background service worker logic
│   ├── contents/          # Content script UI
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   └── utils/         # DOM utilities
│   ├── options/           # Options page components
│   └── shared/            # Shared modules
│       ├── types.ts       # TypeScript type definitions
│       ├── storage.ts     # Chrome storage wrapper
│       ├── messaging.ts   # Message passing (streamChat)
│       ├── prompt.ts      # Prompt building
│       └── ui/            # Design tokens & theme
├── WIKI.md                # Detailed architecture docs
└── package.json
```

## Development

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev build with file watching |
| `npm run build` | Production extension build |
| `npm run typecheck` | TypeScript type checking |
| `npm run package` | Package extension bundle |

### Path Aliases

TypeScript path alias: `~/*` maps to `src/*`

```typescript
import { useUiTheme } from "~/shared/ui/theme"
```

### After Making Changes

1. Run `npm run build`
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
