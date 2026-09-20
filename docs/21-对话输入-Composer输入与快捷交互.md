# Composer输入与快捷交互

## 当前状态
Composer 由 `ComposerArea` 组合输入框、操作按钮、slash 命令、mention、附件行、语音入口、运行参数控件和 awaiting shell。输入交互拆在 `src/features/composer/components/` 与 `hooks/`。

## 核心职责
- 管理文本输入、IME、键盘发送、换行和焦点。
- 提供 slash 命令、Agent Skills 多选、agent mention、随机 introductions/wonders 和快捷操作。
- 在 awaiting、voice、streaming、frontend tool 活跃时限制不安全输入。
- 展示附件、语音、模型、访问级别和 planning mode 控件入口。

## 核心流程
用户输入文本时，Composer hooks 同步 draft、mention 和 slash palette 状态。历史 Chat 的文本草稿按 `chatId` 保存和恢复；未获得稳定 `chatId` 的 New Chat 统一使用空 key，因此不同 Agent 的 New Chat 共享同一份运行期草稿。普通 Chat 或 Agent 切换只切换当前草稿，不清空已保存内容；用户发送时清空该草稿，宿主提供显式一次性预填时则覆盖它。独立 `/查询词` 同时过滤内置命令与当前 Agent 的 Skills；选择 Skill 后形成可移除的“必须使用”标签，支持重复打开 slash palette 多选。点击发送或按快捷键后，`useComposerSend` 决定执行 slash command、steer、普通 query 或阻止发送。Team 不展示 Skills，运行中的 steer 不允许新增或携带 Skills；附件、语音和 awaiting 会影响发送按钮可用性。

跨端划词“添加到对话”把 WebClient 在执行时重新校验的文本保存为当前 Chat 的内存态 `selection` reference，Composer 聚合显示 `N 条批注`，可预览和逐条移除；它与原草稿、文件和 Skills 合并但不自动发送，运行中发送时可独立或随文字一起进入 steer 队列；入队后由队列持有引用，取消或拒绝时恢复，Run 结束后，已有主 query 历史的纯选区排队项也可转 query 并继续携带引用；缺少历史确认时恢复输入区等待正文。同一主 Chat 的首次 query 要求非空正文，后续 query 可只带有效文件或选区引用，正文和有效引用不能同时为空；只有 Run identity 被接受后才清理对应片段，受理前失败继续保留。未发送片段不写 localStorage。

Side question Tab 默认不显示。`/btw` 会先为当前 chat 创建一个空 session，再显示并激活该 Tab；`/btw 问题` 会在主 query/steer 路由前被识别，并把问题作为全新隐藏只读分支的首次请求发送，不能携带此前已关闭分支的 `btwId`。BTW 可以和主 run 并行；没有有效 `chatId` 时命令不可用。

Desktop 划词“在顺便问中提问”只打开并聚焦宿主 WorkPanel 中当前 Chat 的单例“侧边对话”子 Surface，`AgentChatShell` 不再嵌入第二层 RightSidebar。来源页与 `/btw/:chatId` 使用同源 `BroadcastChannel` 完成有界、一次性的内存态交付：Desktop descriptor 只包含固定 target 与 Chat ID，不包含选区正文。子 Surface 保留已有文字草稿与分支，追加片段并聚合显示 `N 个已选文本片段`，但不自动发送。用户在没有文字问题时显式点击发送，WebClient 会使用不包含选区正文的本地化最小问题，以满足 BTW 的非空 `message` 契约；选区仍只通过标准 `references` 传递。BTW identity 接受后才清理片段。划词“解读”仅在 Desktop 提供，macOS 与 Windows 行为一致。它不改写可见 BTW 草稿，从主 Chat 首次发送就声明解释 transport purpose，以默认访问级别在独立解释 lane 发起一次隐藏 BTW Run，只把 canonical `chatId/runId` 交给 Desktop 小窗；小窗 attach、继续同一 `btwId` 分支、Stop 和 detach 均使用解释 transport，保持主 Chat 与 WorkPanel BTW 独立。

Standalone 划词只提供“添加到对话”和“在顺便问中提问”，与 Desktop 共用引用、动作校验、BtwProvider 和 BtwTab。根网站复用已有 RightSidebar；Agent/Copilot 页面使用同一旁聊状态的页内侧栏，不额外打开浏览器标签。浏览器没有详细解释按钮或弹窗，动作处理和 RunTransport 都拒绝解释请求，旧解释 URL 正常返回首页；解释 Surface 在非 Desktop 环境也不会读取 Chat 或订阅 Run。浏览器不注册 Desktop 动作监听，Desktop 不安装网页工具条。

Side question 在回答中也允许关闭。桌面右侧 Tab 的关闭按钮和 Copilot BTW 面板的关闭按钮都执行永久前端丢弃：清除当前 chat 的内容、续接身份和持久化记录，界面回到 Overview，旧分支不能从前端恢复；再次执行 `/btw` 会创建空白新分支。右侧栏最外层的关闭按钮仍只收起侧栏，不丢弃 BTW。丢弃不会中断后端 run 或终止其 SSE，后台请求会自然结束，迟到事件也不能让 Tab 复活。

BTW Composer 在 idle 时于发送位显示 Send；running 时始终在同一位置显示危险态 Stop。run 尚未注册时 Stop 可见但禁用，注册完成后才可点击；中断请求进行中显示 loading 并防止重复请求。只有后端接受中断才结束本地流，中断被拒或网络失败时保持真实 running 状态、显示错误并允许重试。

## 技能图标

`/` 技能候选与加号技能菜单每次打开都失效当前 Agent 的技能查询及请求缓存，读取 Platform 的最新可用技能，避免市场安装或卸载后仍展示旧候选。刷新时机由 Composer 的菜单 hook 管理，公共数据层不承担菜单生命周期；菜单保持打开时不因输入筛选文本反复请求，失败后等待显式重试或重新打开。技能标签等非菜单消费者仍复用正常缓存，置顶顺序继续由既有正式技能置顶查询提供。

加号菜单中的技能列表与 `/` slash 技能候选共用 `SkillIcon`，保留 `/api/skills` 返回的可选 `icon` 字段，使用现有平台身份请求图片 Blob。未提供图标、请求失败或图片损坏时显示默认技能图标；切换候选时中止旧请求并释放 Blob，避免旧图标串用。技能图标来自当前 Agent 的运行技能或技能中心，私有同名技能优先。

## 技能置顶
加号菜单的技能行右侧提供置顶/取消置顶按钮，悬停、键盘聚焦或触屏时可见，已置顶按钮持续高亮。置顶只调整候选顺序，不会选中技能或关闭菜单，运行中仍可调整；最近置顶的技能在前，取消后恢复接口顺序。搜索继续过滤所有候选，`/` 技能候选也共享置顶顺序。

置顶由 agent-platform 保存到 `runtime/skills-center/order.json`，只按登录用户区分，同一用户的所有 Agent 共用一份有序置顶列表。前端通过 `GET /api/skills/order` 读取，通过 `PUT /api/skills/order` 提交单个 `{key,pinned}`；平台 WebSocket 使用同一路径，空 payload 读取，`{key,pinned}` 更新。`order` 只包含已置顶的技能 key；当前 Agent 不提供的技能不会因置顶而出现在候选里。前端只保留内存查询缓存，打开菜单、显示 slash 候选及窗口重新聚焦时重新读取，保存成功后才更新排序，失败时保留原状态并提示重试。旧 localStorage 置顶不再读取或写入。

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

技能中心管理列表与 Composer 使用相同的技能置顶偏好。名称右侧的置顶按钮使用 14px 图标、透明背景和绝对定位，不独占列表列宽；未置顶时仅悬停或键盘聚焦显示灰色图标，已置顶时始终显示主题正文色（浅色近黑、深色浅色）。取消置顶恢复目录默认相对顺序，描述继续使用完整行宽。

## New Chat 项目上下文与 Git 分支

仅主界面 New Chat 的 `ComposerContextBar` 显示上方半框；已有会话及 Copilot（含新会话）不显示。智能体菜单复用 `AgentSwitcherPopover`，当前不显示环境标识；系统大类图标与智能体自定义图标独立，上框图标保持 16×16 并跟随主题。

`useProjectGit` 在半框挂载后先检查有效 `workspaceDir`（空值和 `@chat` 不请求），再通过独立 `/api/project/git` 异步读取；Platform 使用 WebSocket，Gateway 保留 HTTP GET，不阻塞 `/api/agents` 或 `/api/agent`。是否有 Git 仓库由 Platform 按实际 Workspace 判定，不按 CODER/KBASE 筛选，也不使用 `projectConfig.git.expectedBranch` 作为当前分支。

- `branch` 显示真实 `branch`；空仓库也可有分支，`commit` 可省略。
- `detached` 显示“游离 HEAD · 短 SHA”；完整 SHA 保留在 title。
- `not_repository`、`no_workspace`、请求加载中、`unavailable`、请求失败或不合法响应均隐藏整个分支项（图标与文字），不显示占位或错误提示。

挂载、切换智能体、Workspace 路径变化、窗口聚焦或页面重新可见时按需刷新；不轮询。快照按后端模式、origin、Agent 和 Workspace 隔离并合并在途请求，实际分支/游离 HEAD 缓存 30 秒，非仓库/无 Workspace 缓存 5 分钟，临时失败退避 10 秒；刷新保留已有分支显示。切换时立即隐藏旧分支，取消旧请求，并校验响应身份与 effect 生命周期，防止迟到响应串线。没有智能体（例如 Team）不请求。点击有效分支项打开本地分支菜单，按需加载后可切换已有分支或输入名称“新建并切换”。

分支菜单通过 `/api/project/git/branches` 按需加载本地分支；Platform WS 读取 payload 为 `{agentKey}`，写入使用同路径并携带 operation；Gateway 保留 GET/POST。提交 payload 为 `{agentKey,operation:"switch"|"create",branch,expectedRevision}`。revision 来自菜单打开时的 Git 快照，不使用配置期望分支代替。创建从当前 HEAD 开始并立即切换；不处理远端分支、重命名或删除。

菜单打开和操作期间暂停该分支项的自动读取；操作期间禁用重复提交。列表响应自带的 Git 快照直接更新缓存；成功后关闭菜单并复用 mutation 返回快照，不额外查询，失败保留菜单与 Git 原因并重新读取列表，不自动重试写入或因 WS 失败回退 HTTP。切换智能体会卸载旧菜单，旧读取请求取消、旧 mutation 响应只更新原缓存键，不影响当前 Agent；已发出的写操作不会因 UI 卸载被前端中止。`canChange:false` 时展示后端边界原因并禁用写操作：仓库子目录、包含 ChatsRoot 的 Workspace 或无工作树只读。CODER 配置 `expectedBranch` 时提示其运行约束，分支切换不会修改 Agent 配置。

新会话通过 `useAgentWelcome` 共享 `/api/agent` 查询：`greetings` 随机选一条作为主标题，缺失或仅空白时回退“与 <agentName> 对话”；`introductions` 独立随机选一条作为输入框 placeholder，缺失时保留默认输入提示。标题与 Composer 复用查询缓存及并发去重，切换智能体按 key 隔离，普通重渲染保持文案稳定。

`greetings` 支持固定占位符 `${agent}`：前端按字面标记拆分并嵌入现有智能体切换按钮；没有其他智能体可切换时显示名称文本。无标记时保留普通问候语，未知标记保持原文，不执行表达式或 HTML。`introductions` 不解析此占位符。
