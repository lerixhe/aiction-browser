import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/auto-icons'],
  manifest: {
    name: 'Aiction',
    description: 'A lightweight Chrome extension for getting AI help on selected web content.',
    version: '0.0.1',
    permissions: ['storage', 'contextMenus'],
    host_permissions: ['<all_urls>'],
    action: {
      default_popup: 'popup.html',
    },
    options_ui: {
      open_in_tab: true,
    },
    web_accessible_resources: [
      {
        resources: ['pdf.worker.mjs', 'pdf-viewer.html'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
