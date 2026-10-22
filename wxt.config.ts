import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/auto-icons'],
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    version: '0.6.0',
    // `identity`：官方账号登录（chrome.identity.launchWebAuthFlow 拉起授权页）。
    // 商店审核若问询，描述里写「用于打开官方账号登录页」；作为回滚手段可用
    // 构建期常量 OFFICIAL_AUTH_ENABLED（src/shared/auth/config.ts）关掉入口。
    permissions: ['storage', 'contextMenus', 'identity'],
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
