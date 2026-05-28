import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Aiction',
    description: 'A lightweight Chrome extension for getting AI help on selected web content.',
    version: '0.0.1',
    permissions: ['storage', 'contextMenus'],
    host_permissions: ['<all_urls>'],
    icons: {
      '16': 'icon.png',
      '32': 'icon.png',
      '48': 'icon.png',
      '128': 'icon.png',
    },
    action: {
      default_popup: 'popup.html',
      default_icon: {
        '16': 'icon.png',
        '32': 'icon.png',
      },
    },
    options_ui: {
      open_in_tab: true,
    },
    web_accessible_resources: [
      {
        resources: ['pdf.worker.mjs', 'pdf-viewer.html', 'icon.png'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
