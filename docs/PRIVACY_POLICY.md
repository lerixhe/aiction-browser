# Privacy Policy for AIction

**Last Updated:** June 4, 2026

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
- Anonymous usage identifier (randomly generated UUID)

**What We Do NOT Collect:**
- Your selected text content
- Your conversations with AI
- Your API keys or credentials
- Personal identifying information
- Browsing history
- Page content or URLs

**Analytics Provider:** We use PostHog for anonymous usage analytics. Analytics can be disabled at any time in the extension settings.

### 3. Text Processing

When you select text and use AI features:
- The selected text is sent to your configured AI service provider
- This processing happens through your own API credentials
- We do not store or transmit your text to our servers
- Conversations are stored only in memory and are cleared when you close the page

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
- Email: [Your Contact Email]

## Open Source

This extension is open source. You can review the complete source code at:
https://github.com/lerixhe/aiction

---

**Note:** This extension processes text locally and through your chosen AI service. We never have access to your conversations or selected content.
