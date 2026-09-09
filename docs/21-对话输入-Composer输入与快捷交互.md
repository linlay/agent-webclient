# Composer输入与快捷交互

## 当前状态
Composer 由 `ComposerArea` 组合输入框、操作按钮、slash 命令、mention、附件行、语音入口、运行参数控件和 awaiting shell。输入交互拆在 `src/features/composer/components/` 与 `hooks/`。

## 核心职责
- 管理文本输入、IME、键盘发送、换行和焦点。
- 提供 slash 命令、Agent Skills 多选、agent mention、随机 greeting/wonders 和快捷操作。
- 在 awaiting、voice、streaming、frontend tool 活跃时限制不安全输入。
- 展示附件、语音、模型、访问级别和 planning mode 控件入口。

## 核心流程
用户输入文本时，Composer hooks 同步 draft、mention 和 slash palette 状态。历史 Chat 的文本草稿按 `chatId` 保存和恢复；未获得稳定 `chatId` 的 New Chat 统一使用空 key，因此不同 Agent 的 New Chat 共享同一份运行期草稿。普通 Chat 或 Agent 切换只切换当前草稿，不清空已保存内容；用户发送时清空该草稿，宿主提供显式一次性预填时则覆盖它。独立 `/查询词` 同时过滤内置命令与当前 Agent 的 Skills；选择 Skill 后形成可移除的“必须使用”标签，支持重复打开 slash palette 多选。点击发送或按快捷键后，`useComposerSend` 决定执行 slash command、steer、普通 query 或阻止发送。Team 不展示 Skills，运行中的 steer 不允许新增或携带 Skills；附件、语音和 awaiting 会影响发送按钮可用性。

Side question Tab 默认不显示。`/btw` 会先为当前 chat 创建一个空 session，再显示并激活该 Tab；`/btw 问题` 会在主 query/steer 路由前被识别，并把问题作为全新隐藏只读分支的首次请求发送，不能携带此前已关闭分支的 `btwId`。BTW 可以和主 run 并行；没有有效 `chatId` 时命令不可用。

Side question 在回答中也允许关闭。桌面右侧 Tab 的关闭按钮和 Copilot BTW 面板的关闭按钮都执行永久前端丢弃：清除当前 chat 的内容、续接身份和持久化记录，界面回到 Overview，旧分支不能从前端恢复；再次执行 `/btw` 会创建空白新分支。右侧栏最外层的关闭按钮仍只收起侧栏，不丢弃 BTW。丢弃不会中断后端 run 或终止其 SSE，后台请求会自然结束，迟到事件也不能让 Tab 复活。

BTW Composer 在 idle 时于发送位显示 Send；running 时始终在同一位置显示危险态 Stop。run 尚未注册时 Stop 可见但禁用，注册完成后才可点击；中断请求进行中显示 loading 并防止重复请求。只有后端接受中断才结束本地流，中断被拒或网络失败时保持真实 running 状态、显示错误并允许重试。

## 技能图标
加号菜单中的技能列表与 `/` slash 技能候选共用 `SkillIcon`，保留 `/api/skills` 返回的可选 `icon` 字段，使用现有平台身份请求图片 Blob。未提供图标、请求失败或图片损坏时显示默认技能图标；切换候选时中止旧请求并释放 Blob，避免旧图标串用。技能图标来自当前 Agent 的运行技能或技能中心，私有同名技能优先。

## 连接器
Composer 的“+”菜单提供“连接器”，按当前 Agent 加载已安装目录和挂载配置，支持搜索、开关和授权入口。开关初始值来自 Agent 源配置，切换后立即保存并触发平台重载；不随聊天草稿保存，也不进入 Query 请求。窄窗口在原弹层内展示列表和返回入口。具体接口和授权边界见 [连接器](53-Worker管理-连接器.md)。

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
