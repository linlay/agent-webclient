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

Side question Tab 默认不显示。`/btw` 会先为当前 chat 创建一个空 session，再显示并激活该 Tab；`/btw 问题` 会在主 query/steer 路由前被识别，并把问题作为全新隐藏只读分支的首次请求发送，不能携带此前已关闭分支的 `btwId`。BTW 可以和主 run 并行；没有有效 `chatId` 时命令不可用。

Side question 在回答中也允许关闭。桌面右侧 Tab 的关闭按钮和 Copilot BTW 面板的关闭按钮都执行永久前端丢弃：清除当前 chat 的内容、续接身份和持久化记录，界面回到 Overview，旧分支不能从前端恢复；再次执行 `/btw` 会创建空白新分支。右侧栏最外层的关闭按钮仍只收起侧栏，不丢弃 BTW。丢弃不会中断后端 run 或终止其 SSE，后台请求会自然结束，迟到事件也不能让 Tab 复活。

BTW Composer 在 idle 时于发送位显示 Send；running 时始终在同一位置显示危险态 Stop。run 尚未注册时 Stop 可见但禁用，注册完成后才可点击；中断请求进行中显示 loading 并防止重复请求。只有后端接受中断才结束本地流，中断被拒或网络失败时保持真实 running 状态、显示错误并允许重试。

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
- `../src/features/btw/components/BtwTab.tsx`
- `../src/features/btw/components/BtwProvider.tsx`
