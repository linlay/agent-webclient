# 样式主题基础UI与国际化

## 当前状态
全局样式入口为 `src/shared/styles/globals.css`，再按 layout、timeline、composer、tools、voice、responsive 等拆分导入。主题工具在 `theme.ts`，基础 UI 组件在 `src/shared/ui/`，国际化运行时在 `src/shared/i18n/`。

## 核心职责
- 统一全局 CSS 入口，避免在 app 入口散落多个全局样式文件。
- 提供主题模式读取、持久化和 document attribute 应用。
- 维护 UiButton、UiInput、UiTag、MaterialIcon、MarkdownContent 等基础组件。
- 提供 zh-CN/en-US 文案和硬编码中文检查约束。

## 核心流程
`src/app/index.tsx` 只导入 `globals.css`。应用启动时解析 URL、localStorage 或宿主传入的主题/语言配置。组件通过 `useI18n` 或 `t` 获取文案，MarkdownContent 负责 KaTeX、Mermaid、ECharts 和代码块渲染。

## 边界与非目标
- 全局样式新增应先判断是否属于已有 globals 分区。
- 业务组件不应直接复制基础按钮/输入样式。
- 新增用户可见中文时，需要同步 i18n 词条或加入明确允许清单。

## 相关文件
- `../src/shared/styles/globals.css`
- `../src/shared/styles/theme.ts`
- `../src/shared/ui/UiButton.tsx`
- `../src/shared/ui/MarkdownContent.tsx`
- `../src/shared/i18n/runtime.ts`
- `../scripts/check-hardcoded-han.js`

