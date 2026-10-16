# SmileyFace 表情设计存档

灵动岛笑脸组件（`src/entrypoints/content/components/SmileyFace.tsx`）的历史设计方案存档。
每个文件是**自包含的可编译组件**，导出同名组件与 `SmileyMood` 三态类型
（`idle` / `thinking` / `speaking`），接口与线上一致：

```tsx
<SmileyFace size={20} mood="thinking" animated color="#6B2000?" />
```

## 存档内容

| 文件 | 设计名 | 说明 |
|------|--------|------|
| `SoySmileyFace.tsx` | 黄豆人 | Telegram 动画表情风：黄色渐变圆脸（#FFEC5C→#F49A0F）+ 深棕五官（#6B2000）+ 粉腮红（#F68CE8）；idle 整脸快摇 + 眼珠快瞟 + 双速眨眼，thinking 高频微晃 + 歪头眯眼 + 双眉大幅交替 + 歪抿嘴，speaking O 嘴开合 + 点头 |
| `MochiSmileyFace.tsx` | 蜜桃奶油团子 | 日系 kawaii 风：蜜桃奶油渐变脸（#FFE7CF→#FF9E74）+ 暖可可五官（#5F2B1E）+ 樱粉腮红（#FF8FB4）+ 大豆眼双白高光 + 小猫 w 嘴；idle 偶尔歪头偷看 + 眼珠快瞟 + 双速眨眼，thinking 恒歪头 + 头顶三颗思考泡泡，speaking 弯月笑眼 + 点头 + O 嘴 + 旁白音符 |

两者均使用 `aiction-mochi-*` / `aiction-smiley-*` 类名前缀，与当前线上的
简笔版（`smiley-*` 简笔类名）互不冲突；keyframes 在 shadow root 内全局生效，
混用不会互相覆盖。

## 还原方式

1. 用存档文件内容覆盖 `src/entrypoints/content/components/SmileyFace.tsx`
2. 按 AGENTS.md 跑 `npm run typecheck && npm run build`
3. 可选：恢复 `src/entrypoints/content/components/SmileyFace.tsx` 组件名默认导出，
   调用方（`ChatIslandPanel.tsx` / `App.tsx`）无需改动（接口兼容）
