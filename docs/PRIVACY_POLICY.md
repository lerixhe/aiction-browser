# Privacy Policy for AIction

**Last Updated:** October 24, 2026

## Introduction

This Privacy Policy describes how AIction ("we", "our", or "the extension") collects, uses, and protects your information when you use our Chrome browser extension.

## Information We Collect

### 1. User-Configured Data

**AI Service Configuration:**
- API Base URLs
- API Keys
- Model selections
- Model parameters (temperature, max tokens, etc.)

**User Preferences:**
- Theme settings (light/dark/auto)
- Language preferences
- Custom action templates
- Custom icons

**Storage Location:** All configuration data is stored locally in your browser using `chrome.storage.sync` and is synchronized across your Chrome instances if you're signed into your Google account.

### 2. Anonymous Usage Analytics

**What We Collect:**
- Extension installation and update events
- API connection test results (success/failure, latency)
- **Error diagnostics** (see below)
- Anonymous usage identifier (randomly generated UUID)
- **Account state for the official service** (enum values only): a randomly generated device id,
  sign-in state (`signed-in` / `anonymous` / `signed-out`), your plan tier
  (`anonymous` / `free` / `pro` / `max` / `unknown` — `anonymous` is the unsigned-in device principal,
  not a paid tier; `unknown` means that surface had no account snapshot to read),
  and a **bucketed** quota usage ratio (`0` / `<50%` / `<80%` / `<100%` / `100%` / `unknown` — `unknown`
  means the usage figure was not obtainable when the event fired, never a guess).
  Sign-in events record the entry point (`popup` / `options`) and a coarse failure reason
  (`window_closed` / `state_mismatch` / `server_error` / `network` / `unavailable` — `unavailable` means
  the capability was missing on this device, e.g. permission denied or the feature switched off, and is
  deliberately not reported as a server error) — never an email, user id, or token.

**Error Diagnostics:**
When an AI request, connection test, or text-to-speech request fails, we record a diagnostic entry containing:
- a rough error category and the HTTP status code (when the AI SDK provides one);
- the error class name;
- **the full error message and the provider's raw response body**, truncated to 2000 characters;
- provider metadata: provider name, endpoint URL, provider id, models.dev id, model name, whether a custom endpoint is used, and whether an API key is configured (a boolean only).

Before leaving your browser, these fields are scrubbed of credentials: API keys and token-shaped values (`sk-…`, `Bearer …`, `key=…`, `token=…`, `secret=…`) are replaced with placeholders. Nothing else is removed or reshaped. We deliberately keep the raw text — with a small user base, the actual provider error is far more informative than a guessed classification.

> Note: provider error responses can echo back part of the request (for example a validation error may quote the message content that was rejected). If that happens, the echoed text is uploaded as part of the error message. We do not upload your AI conversations, selected text, or page content as separate fields.

**What We Do NOT Collect:**
- Your email address, user id, or any sign-in credential (account state is reported as enum values only)
- Your selected text content (as a separate field — see the note above about provider error echoes)
- Your conversations with AI
- **Your API keys or tokens** (removed by a hard outbound filter that drops credential-named fields and scrubs token-shaped values)
- Personal identifying information
- Browsing history
- Page content or URLs

**Analytics Provider:** We use PostHog for anonymous usage analytics. Analytics can be disabled at any time in the extension settings.

**Sign-in (separate from analytics):** Signing in is optional and is the only flow that talks to our own API. It exchanges a randomly generated device id, this extension's id, and — only after you approve the sign-in page — a session token. The token stays in the extension's background context (never in page scripts, never synced to your Google account), and signing out removes it from this device. Credentials are never sent to PostHog. Without signing in, every feature works exactly as before.

### 3. Text Processing

When you select text and use AI features, one of two paths is used — which one depends on the engine you
selected in the extension:

**Bring your own API key (default, no account needed)**
- The selected text is sent to your configured AI service provider
- This processing happens through your own API credentials
- We do not see, store, or transmit your text to our servers
- Conversations are stored only in memory and are cleared when you close the page

**Official service (optional, requires signing in or running as an anonymous device)**
- The messages needed for the reply (your selected text plus the conversation so far, and the system
  prompt) are sent to our gateway at `api.aiction.app`, which forwards them to the underlying model
  provider and streams the reply back
- Requests are authenticated with a device token (unsigned-in) or an account token (signed in); the token
  never leaves the extension's background context and is never sent to PostHog
- The gateway counts token usage against your quota. Usage records contain the model id, token counts, a
  status code and a timestamp — **not** the content of your messages
- Conversation content is not used for analytics and is not written to the analytics provider; the
  extension still keeps conversations only in memory, so closing the page discards them
- You can switch back to your own API key at any time in the extension settings; the bring-your-own-key
  path never touches our servers

## How We Use Information

### Configuration Data
- To provide and maintain the extension's functionality
- To sync your settings across devices (via Chrome sync)
- To customize your experience

### Anonymous Analytics
- To understand how the extension is used
- To improve extension features and performance
- To identify and fix issues

## Data Sharing

We do not sell, trade, or otherwise transfer your information to third parties.

**Third-Party Services:**
- **PostHog:** Anonymous analytics data only (can be disabled)
- **Your AI Provider:** Text you choose to process (controlled by you)
- **Our gateway and its model providers:** only if you use the optional official service

## Data Security

- API keys are stored locally in your browser's secure storage
- All communication with AI services uses HTTPS
- We do not have access to your stored credentials
- Analytics data is anonymized and cannot be traced back to you

## Your Rights and Choices

### Disable Analytics
You can disable anonymous analytics at any time:
1. Open extension settings
2. Toggle off "Telemetry" option

### Delete Data
- **Settings:** Reset to defaults in the extension options
- **Synced Data:** Clear through Chrome's sync settings
- **Analytics:** Disabling telemetry stops future data collection

### Export/Import
You can export and import your settings at any time through the extension's backup feature.

## Permissions Explained

| Permission | Purpose |
|------------|---------|
| `storage` | Store your settings and preferences locally |
| `contextMenus` | Add "Open PDF with AIction" option for PDF files |
| `<all_urls>` | Enable text selection features on any website |

## Children's Privacy

The extension is not intended for use by children under 13. We do not knowingly collect personal information from children.

## Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of any changes by:
- Updating the "Last Updated" date at the top of this policy
- Posting the new policy in the extension documentation

## Contact Us

If you have questions about this Privacy Policy, please contact us:
- GitHub: https://github.com/lerixhe/aiction/issues
- Email: support@aiction.app

## Open Source

This extension is open source. You can review the complete source code at:
https://github.com/lerixhe/aiction

---

**Note:** This extension processes text locally and through your chosen AI service. We never have access to your conversations or selected content.
