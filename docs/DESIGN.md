# Aiction 设计规范

> Chrome 扩展（MV3）的 UI/UX 设计系统文档，基于 Apple Human Interface Guidelines 风格，由 Plasmo + React + TypeScript 实现。

---

## 1. 设计原则

| 原则 | 说明 |
|------|------|
| **简洁** | 去除视觉噪音，用最少元素传达最多信息 |
| **一致** | 所有组件遵循同一套 tokens，避免零散样式 |
| **沉浸** | 扩展 UI 融入网页，不打断用户注意力 |
| **可达** | 支持浅色/深色主题，遵循基本无障碍规范 |

---

## 2. 色彩系统

### 2.1 主题模式

支持三种主题偏好：`auto`（跟随系统）、`light`、`dark`。

### 2.2 颜色 Token

| 类别 | Token | 浅色 | 深色 |
|------|-------|------|------|
| **背景** | `bg.page` | `#F8F9FA` | `#0F0F23` |
| | `bg.surface` | `#FFFFFF` | `#1A1A2E` |
| | `bg.surfaceAlt` | `#F8F9FA` | `#0F0F23` |
| | `bg.surfaceMuted` | `#F1F3F5` | `#25253D` |
| | `bg.overlay` | `rgba(0,0,0,0.45)` | `rgba(0,0,0,0.65)` |
| | `bg.glass` | `rgba(255,255,255,0.78)` | `rgba(26,26,46,0.82)` |
| **文字** | `text.primary` | `#1A1A2E` | `#F1F5F9` |
| | `text.secondary` | `#6B7280` | `#94A3B8` |
| | `text.inverse` | `#FFFFFF` | `#0F0F23` |
| **边框** | `border.default` | `#E5E7EB` | `#334155` |
| | `border.strong` | `#1A1A2E` | `#F1F5F9` |
| | `border.subtle` | `#F3F4F6` | `#1E293B` |
| | `border.hairline` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.06)` |
| **品牌** | `brand.primary` | `#0D9488` | `#2DD4BF` |
| | `brand.primaryHover` | `#0F766E` | `#14B8A6` |
| | `brand.primaryActive` | `#115E59` | `#0D9488` |
| | `brand.secondary` | `#E0F5F0` | `#1A3A35` |
| | `brand.secondaryHover` | `#CCEBEB` | `#1F4A44` |
| **强调** | `accent.primary` | `#3B82F6` | `#60A5FA` |
| | `accent.primaryHover` | `#2563EB` | `#93C5FD` |
| | `accent.primaryActive` | `#1D4ED8` | `#3B82F6` |
| **状态** | `state.error` | `#EF4444` | `#F87171` |
| | `state.errorBg` | `#FEF2F2` | `#2A0F0F` |
| | `state.warning` | `#F59E0B` | `#FBBF24` |
| | `state.warningBg` | `#FFFBEB` | `#2A1F0A` |
| | `state.success` | `#10B981` | `#34D399` |
| | `state.successBg` | `#ECFDF5` | `#0A2A1A` |
| | `state.disabled` | `#9CA3AF` | `#64748B` |

### 2.3 用色规范

- **主操作**：使用 `accent.primary`（蓝色系）
- **品牌标识**：使用 `brand.primary`（Teal 色系）
- **危险操作**：使用 `state.error`
- **成功/错误反馈**：使用 `state.success` / `state.error`
- **禁用态**：背景使用 `state.disabled`，透明度 50%

---

## 3. 字体排印

### 3.1 字体栈

**正文**：
```
"SF Pro Text", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif
```

**标题/展示**：
```
"SF Pro Display", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif
```

**等宽**：
```
"SF Mono", "Fira Code", "JetBrains Mono", Menlo, Monaco, Consolas, monospace
```

### 3.2 字号

| Token | 值 | 用途 |
|-------|-----|------|
| `xs` | 11px | 辅助说明、参数描述 |
| `sm` | 12px | 标签、次要信息 |
| `md` | 14px | 正文、输入框、按钮 |
| `lg` | 16px | 卡片标题、大按钮 |
| `xl` | 18px | 侧边栏标题 |
| `xxl` | 22px | 对话框标题 |
| `title` | 28px | 页面主标题 |

### 3.3 字重

| Token | 值 | 用途 |
|-------|-----|------|
| `regular` | 400 | 正文、次要文字 |
| `medium` | 500 | 标签、强调文字 |
| `semibold` | 600 | 按钮、卡片标题、选中状态 |
| `bold` | 700 | 页面标题、对话框标题 |

### 3.4 字间距

| Token | 值 | 用途 |
|-------|-----|------|
| `tight` | -0.022em | 标题（紧凑感） |
| `normal` | 0em | 正文 |
| `wide` | 0.025em | 需要松散感的文字 |

### 3.5 行高

| Token | 值 | 用途 |
|-------|-----|------|
| `tight` | 1.2 | 标题 |
| `normal` | 1.5 | 正文 |
| `relaxed` | 1.65 | 状态消息、长文本 |

---

## 4. 间距系统

基于 `2px` 倍数递增的间距 scale：

| Token | 值 | 典型用途 |
|-------|-----|----------|
| `2` | 2px | 极小间距 |
| `4` | 4px | 图标与文字间距、紧凑内边距 |
| `6` | 6px | 标签与输入框间距、紧凑按钮内边距 |
| `8` | 8px | 列表项间距、Nav 按钮内边距 |
| `10` | 10px | 输入框内边距、Nav 项间距 |
| `12` | 12px | 卡片内容间距、按钮组间距 |
| `14` | 14px | 可选卡片内边距 |
| `16` | 16px | 卡片分节间距、标准按钮内边距 |
| `20` | 20px | 卡片内边距、分节顶部间距 |
| `24` | 24px | 页面内容最大内边距 |
| `28` | 28px | 对话框内边距、空状态内边距 |
| `32` | 32px | 侧边栏内边距、页面主内容内边距 |

---

## 5. 圆角

| Token | 值 | 用途 |
|-------|-----|------|
| `sm` | 6px | 侧边栏按钮、Segmented Control |
| `md` | 8px | 输入框、卡片内嵌元素、状态消息 |
| `lg` | 12px | 卡片、对话框 |
| `xl` | 16px | 特殊场景 |
| `pill` | 999px | 按钮（胶囊形）、状态标签 |

---

## 6. 阴影

| Token | 值 | 用途 |
|-------|-----|------|
| `sm` | `0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)` | 轻微浮动元素 |
| `md` | `0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.04)` | 卡片（默认） |
| `lg` | `0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04)` | 浮动面板 |
| `xl` | `0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)` | 对话框 |

**Focus Ring**：`0 0 0 3px {color}33` — 用于键盘/鼠标聚焦状态。

---

## 7. 动效

### 7.1 时长

| Token | 值 | 用途 |
|-------|-----|------|
| `durationFast` | 150ms | 状态切换、hover、focus |
| `durationNormal` | 220ms | 对话框展开、面板切换 |
| `durationExpanded` | 300ms | 较大区域展开 |
| `durationSlow` | 350ms | 复杂动画 |
| `durationSlower` | 500ms | 更复杂动画、页面级过渡 |

### 7.2 缓动曲线

| Token | 值 | 用途 |
|-------|-----|------|
| `easingStandard` | `cubic-bezier(0.25, 0.1, 0.25, 1.0)` | 默认过渡 |
| `easingSpring` | `cubic-bezier(0.34, 1.56, 0.64, 1.0)` | 弹性效果（按钮按下、对话框入场） |
| `easingSpringGentle` | `cubic-bezier(0.22, 1.2, 0.36, 1)` | 温和弹性（微交互） |
| `easingDecelerate` | `cubic-bezier(0, 0, 0.2, 1)` | 元素进入 |
| `easingAccelerate` | `cubic-bezier(0.4, 0, 1, 1)` | 元素退出 |
| `easingBounce` | `cubic-bezier(0.68, -0.55, 0.265, 1.55)` | 弹跳效果 |

### 7.3 动画规范

- **按钮按下**：`transform: scale(0.96)` + 150ms spring
- **对话框入场**：`opacity: 0→1` + `translateY(12px)→0` + `scale(0.97)→1` + 220ms spring
- **遮罩入场**：`opacity: 0→1` + 150ms standard
- **所有状态过渡**：150ms standard（border-color, background, box-shadow 等）

---

## 8. 组件规范

### 8.1 卡片 (Card)

```
border-radius: 12px
padding: 20px 24px
background: bg.surface
box-shadow: shadow.md
border: 1px solid border.hairline
transition: box-shadow 220ms standard, border-color 220ms standard
```

**内嵌卡片 (Inset Card)**：用于卡片内的分组
```
border-radius: 8px
padding: 16px
background: bg.surfaceMuted
border: 1px solid border.hairline
```

### 8.2 按钮 (Button)

**主按钮 (Primary)**
```
border-radius: pill (999px)
padding: 8px 16px
background: accent.primary
color: text.inverse
font-weight: semibold
font-size: 14px
```

**次要按钮 (Secondary)**
```
border-radius: pill (999px)
padding: 8px 16px
background: bg.surface
color: text.primary
border: 1px solid border.default
font-weight: medium
```

**紧凑按钮 (Secondary Compact)**
```
padding: 6px 12px
font-size: 12px
```

**危险按钮 (Danger)**
```
background: state.error
color: text.inverse
border: none
```

**交互状态**：
- Hover：背景色变深（accent.primaryHover）
- Pressed：`scale(0.96)` 弹性效果
- Disabled：背景 `state.disabled`，opacity 0.5，cursor `not-allowed`
- Focused：focus ring `0 0 0 3px accent.primary33`

### 8.3 输入框 (Input)

```
border: 1px solid border.subtle
border-radius: 8px
padding: 10px 12px
font-size: 14px
background: bg.surfaceMuted
```

**聚焦状态**：
```
border-color: accent.primary
box-shadow: 0 0 0 3px accent.primary33
```

### 8.4 开关 (Toggle Switch)

```
width: 44px
height: 24px
border-radius: 8px
background: border.default (关) / accent.primary (开)
```

滑块：
```
width: 18px
height: 18px
border-radius: 50%
background: #fff
shadow: 0 1px 3px rgba(0,0,0,0.2)
left: 3px (关) / 23px (开)
```

### 8.5 分段控制器 (Segmented Control)

```
display: inline-flex
background: bg.surfaceMuted
border-radius: 6px
padding: 3px
gap: 2px
```

选项：
```
padding: 6px 16px
border-radius: 5px (sm - 1)
background: bg.surface (选中) / transparent (未选中)
font-weight: semibold (选中) / regular (未选中)
```

### 8.6 可选卡片 (Selectable Card)

```
border: 1px solid border.default (未选中) / accent.primary (选中)
border-radius: 8px
background: bg.surface (未选中) / bg.surfaceAlt (选中)
padding: 14px
box-shadow: none (未选中) / focus ring (选中)
```

### 8.7 对话框 (Confirm Dialog)

**遮罩层**：
```
position: fixed
inset: 0
background: bg.overlay
backdrop-filter: blur(12px)
z-index: 2147483647 (max)
animation: fadeIn 150ms standard
```

**对话框卡片**：
```
max-width: 400px
width: calc(100% - 48px)
padding: 28px
border-radius: 16px
box-shadow: shadow.xl
animation: slideUp 220ms spring
```

**标题**：`font-size: 22px, font-weight: bold`
**描述**：`font-size: 14px, color: text.secondary, line-height: 1.55`
**按钮区**：`display: flex, justify-content: flex-end, gap: 12px`

### 8.8 状态消息 (Status Message)

```
font-size: 12px
padding: 8px 12px
border-radius: 8px
line-height: 1.65
border: 1px solid {color}22
```

| 语义 | 文字色 | 背景色 |
|------|--------|--------|
| success | state.success | state.successBg |
| error | state.error | state.errorBg |
| info | text.secondary | bg.surfaceAlt |

### 8.9 空状态 (Empty State)

```
text-align: center
padding: 28px 16px
border: 1px dashed border.default
background: bg.surfaceMuted
color: text.secondary
font-size: 14px
```

### 8.10 代码标签 (Inline Code)

```
background: bg.surfaceMuted
padding: 2px 6px
border-radius: 2px
font-size: 11px
```

---

## 9. 布局规范

### 9.1 设置页布局

**侧边栏 (Sidebar)**：
```
width: 320px
height: 100vh
background: bg.surface
border-right: 0.5px solid border.hairline
```

- Logo 区：`padding: 20px 32px 12px`
- 导航区：`padding: 4px 32px`
- 导航项间距：4px
- 导航项：外观、AI服务、动作指令、备份

**主内容区**：
```
flex: 1
overflow-y: auto
```

**内容容器**：
```
max-width: 1000px
min-width: 400px
padding: 32px 32px 20px
```

**页面标题**：`font-size: 28px, font-weight: bold, margin-bottom: 24px`

### 9.2 导航项

```
display: flex
align-items: center
gap: 8px
width: 100%
padding: 8px 10px
border-radius: 8px
```

**激活指示器**：
```
position: absolute
left: 2px
width: 3px
height: 16px
border-radius: 1.5px
background: accent.primary
```

**状态**：
- 激活：`background: bg.surfaceMuted, color: text.primary, font-weight: semibold`
- Hover：`background: bg.surfaceAlt`
- 默认：`background: transparent, color: text.secondary`

### 9.3 卡片标题区

**一级标题 (h2)**：
```
font-size: 16px
font-weight: semibold
letter-spacing: -0.022em
margin: 0 0 4px
```

**二级标题 (h3)**：
```
font-size: 14px
font-weight: semibold
letter-spacing: -0.022em
```

**描述文字**：
```
font-size: 14px
color: text.secondary
margin: 0 0 16px
```

### 9.4 分隔线

```
border-top: 0.5px solid border.hairline
margin: 20px 0
```

---

## 10. 图标规范

- **侧边栏图标**：18×18px
- **Logo**：32×32px，蓝色渐变棱镜图标 `linear-gradient(135deg, #60A5FA, #3B82F6)`，带 `clipPath` 圆角（rx=8），实现在 `src/shared/ui/icons.tsx`
- **按钮内图标**：14×14px
- **SVG 描边**：1.2-1.5px
- **图标颜色**：跟随文字色或状态色

---

## 11. 响应式规则

- 侧边栏固定 320px，不可折叠
- 主内容区最小宽度 400px，最大 1000px，居中
- 网格布局使用 `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`
- 参数网格使用 `grid-template-columns: 1fr 1fr`

---

## 12. 无障碍

- 所有交互元素支持键盘聚焦（focus ring）
- Toggle Switch 使用 `role="switch"` + `aria-checked`
- 对话框使用 `role="dialog"` + `aria-modal="true"` + `aria-labelledby` + `aria-describedby`
- 活动导航项使用 `aria-current="page"`
- 状态消息使用 `role="status"` + `aria-live="polite"`
- 可选按钮使用 `aria-pressed`

---

## 13. 文件结构

```
src/shared/ui/
├── tokens.ts   # 颜色、字体、间距、圆角、阴影、动效、层级、布局 token
├── styles.ts   # 可复用的样式工厂函数
├── theme.ts    # 主题切换逻辑（useUiThemeName, useUiTheme）
└── icons.tsx   # BrandIcon 组件（品牌 SVG 图标）
```

**样式工厂函数**：
- `createFocusRing(color)` — 聚焦环
- `createCardStyle(theme)` — 卡片
- `createInputStyle(theme, focused)` — 输入框
- `createButtonStyle(theme, variant, options?)` — 按钮（variant: primary | secondary | danger, options: disabled/pressed/focused/compact）
- `createStatusMessageStyle(theme, tone)` — 状态消息（tone: success | error | info）
- `createFieldLabelStyle(theme)` — 字段标签
- `createOverlayStyle(theme)` — 遮罩层

**导出 Token 常量**：
- `uiThemes` — 完整主题对象（light/dark）
- `uiTypography` — 字体栈、字号、字重、字间距
- `uiSpace` — 间距 scale（2-32）
- `uiRadius` — 圆角（sm/md/lg/xl/pill）
- `uiShadow` — 阴影（sm/md/lg/xl）
- `uiMotion` — 动效时长 + 缓动曲线
- `uiLayer` — z-index 层级（overlay: 2147483647）
- `uiLayout` — 布局常量（edgeInset, toolbar, chatPanel）

---

## 14. 内容脚本 UI 层级与布局常量

```
uiLayer: {
  overlay: 2147483647  // 最大 z-index，确保对话框在最上层
}
```

```
uiLayout: {
  edgeInset: 8,          // 工具栏距视口边缘最小距离
  toolbar: {
    yOffset: 56,
    preferredXOffset: 160,
    widthEstimate: 420,
    inputMinWidth: 160
  },
  chatPanel: {
    width: 420,
    height: 360,
    initialX: 24,
    initialY: 24
  }
}
```

内容脚本 UI 运行在 Shadow DOM 内，事件处理需使用 `event.composedPath()` 而非 `event.target`。

---

## 15. 设计决策备忘

1. **0.5px 边框**：使用 `0.5px solid` 实现 Retina 屏幕下的精细分割线
2. **胶囊按钮**：所有按钮使用 `border-radius: pill`，风格统一
3. **弹性动效**：使用 `easingSpring` 给按钮/对话框添加轻微弹性，增加趣味感
4. **禁用态灰度**：使用统一的 `state.disabled` 色 + 0.5 opacity
5. **深色模式**：不简单反转，而是精心调整的独立色值

---

**文档版本**：1.1  
**最后更新**：2026-04-24
