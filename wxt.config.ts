import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/auto-icons'],
  /**
   * `manifest` 用函数形式只为按 **mode** 给开发包打标（WXT 支持 `({ mode }) => Manifest`）。
   *
   * 为什么必须能一眼分辨：WXT 把产物按 mode 分成 `.output/chrome-mv3`（production）与
   * `.output/chrome-mv3-dev`（development），两者可以同时装进同一个 profile。它们原名同图标，
   * 唯一差别是**连哪个网关**（`src/shared/auth/config.ts` 的 `API_BASE` / `AUTHORIZE_BASE` 是构建期常量）：
   * dev 连本地 mock，prod 连 `api.aiction.app`。曾经在 prod 包的设置页点「登录」，
   * 授权窗口打开的是线上地址、mock 一条请求都收不到，表现成「点了没反应」。
   *
   * 因此 dev 包的 manifest name 直接写死字面量（不走 `__MSG_extName__`），
   * chrome://extensions 与扩展详情页都会显示「AIction (dev)」，点错立刻能看出来。
   * production 分支保持 i18n 占位符不变（上架包的名称只由 `public/_locales/*` 下发）。
   */
  manifest: ({ mode }) => ({
    name: mode === 'development' ? 'AIction (dev)' : '__MSG_extName__',
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
  }),
});
