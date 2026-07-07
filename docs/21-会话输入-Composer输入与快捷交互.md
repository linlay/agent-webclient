# Composer输入与快捷交互

## 当前状态
Composer 由 `ComposerArea` 组合输入框、操作按钮、slash 命令、mention、附件行、语音入口、运行参数控件和 awaiting shell。输入交互拆在 `src/features/composer/components/` 与 `hooks/`。

## 核心职责
- 管理文本输入、IME、键盘发送、换行和焦点。
- 提供 slash 命令、agent mention、随机 greeting/wonders 和快捷操作。
- 在 awaiting、voice、streaming、frontend tool 活跃时限制不安全输入。
- 展示附件、语音、模型、访问级别和 planning mode 控件入口。

## 核心流程
用户输入文本时，Composer hooks 同步 draft、mention 和 slash palette 状态。点击发送或按快捷键后，`useComposerSend` 决定执行 slash command、steer、普通 query 或阻止发送。附件、语音和 awaiting 会影响发送按钮可用性。

## 边界与非目标
- Composer 负责收集用户意图，不直接处理流式事件。
- 快捷命令的后端副作用通过 data client 调用，不在 UI 组件里手写 fetch。
- 附件上传细节、运行参数、消息路由分别有独立专题说明。

## 相关文件
- `../src/features/composer/components/ComposerArea.tsx`
- `../src/features/composer/components/ComposerInput.tsx`
- `../src/features/composer/components/ComposerActions.tsx`
- `../src/features/composer/components/SlashPalette.tsx`
- `../src/features/composer/hooks/useComposerKeyboard.ts`
- `../src/features/composer/hooks/useComposerSlash.ts`

