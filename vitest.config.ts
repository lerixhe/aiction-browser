import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const src = fileURLToPath(new URL("./src", import.meta.url))

/**
 * 单测配置（SPEC §12.1）。
 *
 * 环境固定 `node`：受测模块全是纯逻辑 + 存储适配层，`chrome.*` 由测试自己 stub。
 * 不引 jsdom——把 React 组件的验证留给手测清单，避免为了几行 DOM 断言引入一整套浏览器环境。
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": src,
      "~": src
    }
  },
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    // 认证相关单测共享「存储 = 内存 Map」的语义，必须每个用例独立，不允许跨文件复用模块状态
    isolate: true
  }
})
