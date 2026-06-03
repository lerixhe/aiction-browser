# 计划：在 About 页面添加 GitHub 链接并优化 UI

## 目标
将 GitHub 仓库链接 `https://github.com/lerixhe/aiction` 添加到浏览器扩展的 About 页面中。

## 修改文件清单

### 1. `src/shared/i18n/locales/en.ts`
**位置**: 第 135-136 行附近

**修改内容**:
```diff
- "options.about.contactTitle": "Contact Us",
- "options.about.emailLabel": "Email: support@aiction.app",
+ "options.about.communityTitle": "Community & Contact",
+ "options.about.githubLabel": "GitHub",
+ "options.about.emailLabel": "Email: support@aiction.app",
```

### 2. `src/shared/i18n/locales/zh_CN.ts`
**位置**: 第 135-136 行附近

**修改内容**:
```diff
- "options.about.contactTitle": "联系我们",
- "options.about.emailLabel": "Email：support@aiction.app",
+ "options.about.communityTitle": "社区与联系",
+ "options.about.githubLabel": "GitHub",
+ "options.about.emailLabel": "Email：support@aiction.app",
```

### 3. `src/entrypoints/options/AboutSection.tsx`
**位置**: 第 82-93 行附近（联系我们部分）

**修改内容**:
```tsx
// 将 "联系我们" 改为 "社区与联系"，并添加 GitHub 链接
<div
  style={{
    marginTop: uiSpace[16],
    fontSize: uiTypography.fontSize.md,
    color: theme.text.secondary,
    lineHeight: 1.7
  }}>
  <div style={{ fontWeight: uiTypography.fontWeight.semibold, color: theme.text.primary, marginBottom: uiSpace[4] }}>
    {t("options.about.communityTitle")}
  </div>
  <div style={{ display: "flex", alignItems: "center", marginBottom: uiSpace[4] }}>
    <span style={{ color: theme.brand?.primary || theme.accent?.primary || "#0D9488", marginRight: uiSpace[8] }}>·</span>
    <span>{t("options.about.githubLabel")}: </span>
    <a
      href="https://github.com/lerixhe/aiction"
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: theme.accent.primary,
        textDecoration: "none",
        marginLeft: uiSpace[4]
      }}
    >
      github.com/lerixhe/aiction
    </a>
  </div>
  <div style={{ display: "flex", alignItems: "baseline" }}>
    <span style={{ color: theme.brand?.primary || theme.accent?.primary || "#0D9488", marginRight: uiSpace[8] }}>·</span>
    {t("options.about.emailLabel")}
  </div>
</div>
```

## 验证步骤

1. 运行 `npm run typecheck` 确保 TypeScript 类型正确
2. 运行 `npm run build` 确保构建成功
3. 在浏览器中加载扩展，打开 Options > About 页面验证显示效果
