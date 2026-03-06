# Design System

## 目标
本项目的设计系统用于解决三个问题：
- 视觉不一致：同类控件在不同页面样式不同
- 交互不一致：hover/focus/disabled 反馈不统一
- 维护成本高：样式散落在业务组件里

## 设计令牌
所有基础视觉令牌统一在：
- `src/styles/globals.css` 的 `:root` / `html[data-theme='dark']`

核心令牌类别：
- 颜色：`--bg-*`、`--ink-*`、`--accent-*`
- 边框：`--line-soft`、`--line-strong`
- 阴影：`--shadow-soft`、`--shadow-medium`、`--shadow-strong`
- 圆角：`--radius-sm/md/lg/xl`

规则：
- 业务组件不得硬编码品牌色与阴影
- 新组件优先复用 token，不新增局部魔法值

## 基础组件

### UiButton
文件：`src/components/ui/UiButton.tsx`

能力：
- `variant`: `primary | secondary | ghost | danger`
- `size`: `sm | md`
- `iconOnly`: 图标按钮
- `active`: 激活态
- `loading`: 加载态（自动禁用）

### UiInput
文件：`src/components/ui/UiInput.tsx`

能力：
- `inputSize`: `sm | md`
- 统一 focus/focus-visible 态

### UiCard
文件：`src/components/ui/UiCard.tsx`

能力：
- `tone`: `default | subtle`

### UiTag
文件：`src/components/ui/UiTag.tsx`

能力：
- `tone`: `default | accent | muted | danger`

### UiSection
文件：`src/components/ui/UiSection.tsx`

能力：
- `UiSection`
- `UiSectionHead`
- `UiSectionBody`

### UiListItem
文件：`src/components/ui/UiListItem.tsx`

能力：
- `selected`: 选中态
- `dense`: 紧凑行高

## 已完成迁移范围
- TopNav：按钮体系
- LeftSidebar：操作按钮、搜索输入、列表项、标签
- RightSidebar：按钮与 tool 卡片
- ComposerArea：输入/发送/中断/语音/引导按钮
- SettingsModal：按钮与输入
- PlanPanel：header 按钮与标签
- ToolPill：详情区块
- WorkerChatSidebar：列表项与按钮
- MentionSuggest / ThinkingBlock / EventPopover：按钮体系

## 约束与规范
- 不在业务组件里直接造新的按钮视觉类，优先 `UiButton`
- 不在业务组件里直接造新的输入视觉类，优先 `UiInput`
- 列表项优先 `UiListItem`
- 标签优先 `UiTag`
- 分组卡片优先 `UiCard` / `UiSection`
- 新增视觉能力应先扩展 `ui` 组件，再在业务侧使用

## 后续演进建议
- 增加 `UiTextarea`、`UiModal`、`UiTabs`
- 为 `ui` 组件补充单测与视觉快照
- 增加组件示例页（Storybook 或内部 playground）
