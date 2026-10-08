# Composer输入与快捷交互

## 当前状态
Composer 由 `ComposerArea` 组合输入框、操作按钮、slash 命令、mention、附件行、语音入口、运行参数控件和 awaiting shell。输入交互拆在 `src/features/composer/components/` 与 `hooks/`。

## 核心职责
- 管理文本输入、IME、键盘发送、换行和焦点。
- 提供 slash 命令、Agent Skills 多选、agent mention、随机 introductions/wonders 和快捷操作。
- 在 awaiting、voice、streaming、frontend tool 活跃时限制不安全输入。
- 展示附件、语音、模型、访问级别和 planning mode 控件入口。

## 核心流程
用户输入文本时，Composer hooks 同步 draft、mention 和 slash palette 状态。历史 Chat 的文本草稿和手动技能选择按 `chatId` 保存和恢复；未获得稳定 `chatId` 的 New Chat 统一使用空 key，因此不同 Agent 的 New Chat 共享同一份运行期草稿与手动技能选择。普通 Chat、New Chat 或 Agent 切换只切换当前槽位，不清空已保存内容。用户发送时清空当前草稿和手动技能；宿主提供显式一次性预填时替换空 Chat 槽位的草稿与手动技能，纯文本预填清除旧手动技能，明确空草稿则同时清空两者；显式技能预填替换为指定技能。未提供预填字段的普通新聊天保留共享草稿与选择，历史 Chat 缓存和合法宿主强制技能不受影响。独立 `/查询词` 同时过滤内置命令与当前 Agent 的 Skills；选择 Skill 后形成可移除的“必须使用”标签，支持重复打开 slash palette 多选。点击发送或按快捷键后，`useComposerSend` 决定执行 slash command、steer、普通 query 或阻止发送。Team 不展示 Skills，运行中的 steer 不允许新增或携带 Skills；附件、语音和 awaiting 会影响发送按钮可用性。

跨端划词“添加到对话”把 WebClient 在执行时重新校验的文本保存为当前 Chat 的内存态 `selection` reference，Composer 聚合显示 `N 条批注`，可预览和逐条移除；它与原草稿、文件和 Skills 合并但不自动发送，运行中发送时可独立或随文字一起进入 steer 队列；入队后由队列持有引用，取消或拒绝时恢复，Run 结束后，已有主 query 历史的纯选区排队项也可转 query 并继续携带引用；缺少历史确认时恢复输入区等待正文。同一主 Chat 的首次 query 要求非空正文，后续 query 可只带有效文件或选区引用，仅最后一次主 Run 明确异常结束或取消、且服务端 canContinue 为 true 时允许正文和引用都为空，表示继续。空 query 保留空 message，仅模型输入补充 `Continue based on the current conversation context.`，时间线不生成空白用户气泡；空 steer 仍禁止；只有 Run identity 被接受后才清理对应片段，受理前失败继续保留。未发送片段不写 localStorage。

Side question Tab 默认不显示。`/btw` 会先为当前 chat 创建一个空 session，再显示并激活该 Tab；`/btw 问题` 会在主 query/steer 路由前被识别，并把问题作为全新隐藏只读分支的首次请求发送，不能携带此前已关闭分支的 `btwId`。BTW 可以和主 run 并行；没有有效 `chatId` 时命令不可用。

Desktop 划词“在顺便问中提问”只打开并聚焦宿主 WorkPanel 中当前 Chat 的单例“侧边对话”子 Surface，`AgentChatShell` 不再嵌入第二层 RightSidebar。来源页与 `/btw/:chatId` 使用同源 `BroadcastChannel` 完成有界、一次性的内存态交付：Desktop descriptor 只包含固定 target 与 Chat ID，不包含选区正文。子 Surface 保留已有文字草稿与分支，追加片段并聚合显示 `N 个已选文本片段`，但不自动发送。用户在没有文字问题时显式点击发送，WebClient 会使用不包含选区正文的本地化最小问题，以满足 BTW 的非空 `message` 契约；选区仍只通过标准 `references` 传递。BTW identity 接受后才清理片段。划词“解读”仅在 Desktop 提供，macOS 与 Windows 行为一致。它不改写可见 BTW 草稿，从主 Chat 首次发送就声明解释 transport purpose，以默认访问级别在独立解释 lane 发起一次隐藏 BTW Run，只把 canonical `chatId/runId` 交给 Desktop 小窗；小窗 attach、继续同一 `btwId` 分支、Stop 和 detach 均使用解释 transport，保持主 Chat 与 WorkPanel BTW 独立。

Standalone 划词只提供“添加到对话”和“在顺便问中提问”，与 Desktop 共用引用、动作校验、BtwProvider 和 BtwTab。顺便问的划词只是待发送的引用：不在来源页或主对话上绘制编号标记层，引用列表也不提供定位回原文，标记与批注只属于主对话的“添加到对话”。根网站复用已有 RightSidebar；Agent/Copilot 页面使用同一旁聊状态的页内侧栏，不额外打开浏览器标签。浏览器没有详细解释按钮或弹窗，动作处理和 RunTransport 都拒绝解释请求，旧解释 URL 正常返回首页；解释 Surface 在非 Desktop 环境也不会读取 Chat 或订阅 Run。浏览器不注册 Desktop 动作监听，Desktop 不安装网页工具条。

Side question 在回答中也允许关闭。桌面右侧 Tab 的关闭按钮和 Copilot BTW 面板的关闭按钮都执行永久前端丢弃：清除当前 chat 的内容、续接身份和持久化记录，界面回到 Overview，旧分支不能从前端恢复；再次执行 `/btw` 会创建空白新分支。右侧栏最外层的关闭按钮仍只收起侧栏，不丢弃 BTW。丢弃不会中断后端 run 或终止其 SSE，后台请求会自然结束，迟到事件也不能让 Tab 复活。

BTW Composer 在 idle 时于发送位显示 Send；running 时始终在同一位置显示危险态 Stop。run 尚未注册时 Stop 可见但禁用，注册完成后才可点击；中断请求进行中显示 loading 并防止重复请求。只有后端接受中断才结束本地流，中断被拒或网络失败时保持真实 running 状态、显示错误并允许重试。

## 技能图标

`/` 技能候选与加号技能菜单每次打开都失效当前 Agent 的技能查询及请求缓存，读取 Platform 的最新可用技能，避免市场安装或卸载后仍展示旧候选。刷新时机由 Composer 的菜单 hook 管理，公共数据层不承担菜单生命周期；菜单保持打开时不因输入筛选文本反复请求，失败后等待显式重试或重新打开。技能标签等非菜单消费者仍复用正常缓存，技能列表和置顶顺序由同一次 `/api/skills` 响应提供，不额外请求置顶。

加号菜单中的技能列表与 `/` slash 技能候选共用 `SkillIcon`，保留 `/api/skills` 返回的可选 `icon` 字段，使用现有平台身份请求图片 Blob。未提供图标、请求失败或图片损坏时显示默认技能图标；切换候选时中止旧请求并释放 Blob，避免旧图标串用。技能图标来自全局技能中心，不随 Agent 改变。

## 技能包选择

加号技能菜单消费 `/api/skills` 可选 `packages` 字段，将技能包和独立技能放在同一列表，技能包仍可展开成员。搜索框下提供“技能包”和“独立技能”两个类型筛选按钮，默认均未选中时显示全部；选择一个后只显示该类型，再次点击取消，恢复全部。筛选与搜索共同生效，不改变已选技能。技能选择面板保留固定的可用高度，结果在内部滚动；开始操作筛选、搜索或成员后，移出悬停区域不自动关闭，可用 Escape、点击外部或切换分类退出。包名行展开成员，右侧“全选／清空”操作整包；点击成员行切换选择，以背景深浅和已选计数表示全部或部分选中，不显示复选框。Hover 或键盘聚焦包名预览成员；输入框包标签使用普通 Tooltip，悬停或键盘聚焦时只列出已选技能名称，不展示完整技能树、包标题、长描述或操作按钮。缺失成员显示不可用，包不完整时禁止整包选择，但允许选择已就绪成员。旧 Platform 未返回包信息时保留原平铺列表。

选中状态仍保存具体技能，不持久化可自动扩大的包引用，发送继续使用去重后的 `mustUseSkills`。包更新不能悄悄增加本轮选择；输入区把已选成员聚合成一个可移除包标签，成员选择在加号技能菜单中调整，宿主强制技能保持锁定。目录刷新后发现已选技能失效时提示移除并阻止发送，不默默漏掉用户选中的能力。

## 技能置顶
加号菜单的技能行右侧提供置顶/取消置顶按钮，悬停、键盘聚焦或触屏时可见，已置顶按钮持续高亮。选择菜单和技能中心共用基础混排规则：技能包和独立技能均可整体置顶，按同一置顶顺序靠前，其余项目按展示名称一起排序；不再为置顶或类型单独分区。包置顶保存包 ID，不展开成员，也不由成员置顶状态推导。取消置顶后按名称重新排序，不重复展示。置顶只调整候选顺序，不会选中技能或关闭菜单，运行中仍可调整；最近置顶的技能在前，取消后恢复名称顺序。搜索继续过滤所有候选，`/` 技能候选也共享置顶顺序。

加号技能菜单每次打开时，在基础排序上优先展示当前草稿已选技能（包含宿主强制技能）及含有已选成员的技能包；已选组与未选组内分别保留置顶和名称顺序。包保留成员层级与全部／部分已选计数，不复制成员到独立列表。独立技能以勾选图标、背景和 `aria-pressed` 标记当前选择，`configured` 仍只表示智能体已配置，不参与选择排序。打开期间保留本次选择排序依据，选中标记继续反映最新状态，下次打开再更新排序。搜索和类型筛选仅在匹配候选中应用上述顺序，不添加技能、不修改置顶偏好，也不依据运行中实际使用记录排序；技能选择仍按原规则形成发送时的 `mustUseSkills`。

置顶由 agent-platform 保存到 `runtime/skills-center/order.json`，只按登录用户区分，同一用户的所有 Agent 共用一份有序置顶列表。前端通过 `GET /api/skills?agentKey=...` 读取，通过 `PUT /api/skills` 提交单个 `{id,pinned}`；平台 WebSocket 使用同一路径，空 payload 读取，`{id,pinned}` 更新。响应中的 `pinned` 只包含已置顶 id，与 `skills` 同级；技能目录全局共享，`agentKey` 仅计算 `configured` 标记，已配置技能显示“智能体已配置”，不自动加入 mustUseSkills。技能中心改用 HTTP `GET /api/admin/skills` 读取管理目录和置顶，HTTP `PUT /api/admin/skills/pin` 写入；与使用侧共用存储，但不调用 `/api/skills`。前端只保留内存查询缓存，打开菜单、显示 slash 候选及窗口重新聚焦时重新读取，保存成功后才更新排序，失败时保留原状态并提示重试。旧 localStorage 置顶不再读取或写入。

## 连接器
目录、挂载读取与开关保存均通过统一请求路由：Platform 复用主 WS，Desktop 复用 Frame Port/Broker；Gateway 当前保留 HTTP。WS 失败直接上报，不回退 HTTP 或自动重放写入。目录保持无缓存，关联读取复用共享 Agent 详情缓存和请求合并，管理目录与认证仍走独立 HTTP 接口。

使用接口为 `/api/agent`、`GET /api/connectors?agentKey=...` 和 `PUT /api/agents/connectors`，不单独读取挂载或调用管理目录。Agent 的 tools/skills/connectors 均为 ID 数组，菜单开关复用共享 Agent 的 connectors；目录保留 id/name、可选 description/iconUrl/mutuallyExclusiveWith，并提供 readiness、MCP 同步快照和 Agent 的 reloadPending。平台预置不出现在菜单，普通 builtin 仍可切换。

Composer 的“+”菜单提供“连接器”，按当前 Agent 加载已安装目录和挂载配置，支持搜索；每行显示图标、名称、可用状态和开关。账号授权、CLI 准备和 Token 凭据由独立连接器中心提供。开关初始值来自 Agent 源配置，切换后立即保存并触发平台重载；不随聊天草稿保存，也不进入 Query 请求。窄窗口在原弹层内展示列表和返回入口。具体接口和授权边界见 [连接器](53-Worker管理-连接器.md)。

连接器菜单每次打开时优先展示当前 Agent 已挂载的连接器，两组内保留目录原顺序。排序依据在本次打开期间保持稳定，切换开关、保存、搜索和清空搜索均不会因挂载状态变化移动行；开关和互斥校验继续使用最新挂载状态，重新打开后按最新配置排序。挂载选择不代表账号已授权、客户端在线或运行中实际调用，不使用授权或调用状态排序。

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

技能中心管理列表与 Composer 使用相同的技能置顶偏好，但各自使用管理端与使用端接口和独立查询状态。管理端写入不主动触发 Composer 请求，Composer 下次打开菜单等既有刷新时机重新读取。名称右侧的置顶按钮使用 14px 图标、透明背景和绝对定位，不独占列表列宽；未置顶时仅悬停或键盘聚焦显示灰色图标，已置顶时始终显示主题正文色（浅色近黑、深色浅色）。取消置顶恢复目录默认相对顺序，描述继续使用完整行宽。

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

## 当前 Agent 不可用

Composer 按当前 Chat 的持久化 owner 独立请求 `/api/agent`；不依赖当前 Agent 出现在导航目录，也不构造占位的可执行 Agent。进入会话、返回页面/窗口聚焦以及显式重试会重新检查当前详情，并清除详情缓存；请求超时为 15 秒，旧请求在切换、重试或超时后不得覆盖新状态。

- 检查中：首次检查或切换 Agent/Chat 时保留输入框，在原有操作栏内提示“正在检查 Agent 状态…”，暂不开放发送。同一 Agent/Chat 的后台复查保留上次已确认状态，不临时禁用操作、不卸载输入框或配置按钮、不改变输入区高度；新结果到达后再更新执行状态。聚焦发生在鼠标按下之前，不能让检查引发聊天视口变化而吞掉首次点击。
- 404：composer 显示“当前 Agent 不可用，点击查看配置”，链接到 `/agents/:agentKey`，不在页面顶部另加提示。现有接口不能区分配置无效和已删除，使用统一文案；配置页按管理接口显示诊断或不存在错误。
- 401/403：分别展示登录失效/无权访问，不能伪装成配置异常。
- 网络、其他服务错误或超时：显示检查失败及重试入口。
- 成功：恢复普通 composer；不自动重发草稿、旧消息或审批。

不可用期间保留输入框与草稿，禁用输入和继续执行，在原操作栏内显示原因、配置或重试入口；不增加聊天遮罩，也不触发历史重载。发送/重发、steer 与 awaiting 提交函数仍检查同一执行状态；已有 Run 的停止入口继续可用。历史阅读、复制和搜索继续可用。此状态是 UI 准入提示，服务端仍在每次 query/续聊时检查真实配置和权限。Team 仍使用其原有执行路径。

连接器 no_auth（包括 Desktop）在“+”菜单挂载后无需认证检查，不显示连接或检查中；挂载开关不代表客户端在线。六种认证模式见 [连接器](53-Worker管理-连接器.md#六种-auth_mode)。

### 运行中 steer 快捷键

Enter 将当前文字或有效引用加入本地等待区；输入框为空时 Cmd+Enter 提交当前 Run 的第一条等待项。输入框有文字或有效引用时 Cmd+Enter 直接提交该内容到服务端 steer 队列，已有等待项保留。两条路径共享受理确认、失败恢复与防重复提交逻辑；输入框及等待区均为空时不执行操作。Shift+Enter 保持换行，输入法确认、上传中、附件失败和交互阻塞继续按原规则处理。

空 query 的资格由 `/api/chat` 和 `/api/chats` 的 `canContinue` 提供，实时主 Run 的异常或取消终态更新为可继续，正常完成、新 query、Run 启动或等待人工交互时关闭。子任务、隐藏旁聊、旧快照和未知终态不授予资格；后端始终按持久化状态再次校验。仅附件续聊仍按已有历史校验。

## Composer 目录同步

Platform 正常聚焦不再刷新 `/api/agent` 和 `/api/skills`。Agent 根据 catalog.updated（除 viewports）、重连和显式重试刷新；仅 unavailable/forbidden/error 且无在途检查时允许 focus 强制恢复。checking 与 authentication_required 不响应 focus，认证凭证更新另行触发检查。界面和发送拦截统一读取全局 agentAvailability；同 Agent 的 Chat 切换沿用确认状态，后台刷新不替换输入区。

Composer 技能候选及已选技能订阅 skills/agents/config/connectors 目录通知和重连。菜单打开与重新检查仍强制刷新，多个消费者共享请求；技能置顶由同一目录响应提供，跨窗口改置顶在下次打开菜单时同步。目录明确缺少的手动技能仍提示移除；服务端拒绝技能时保留错误提示、配置入口和重新检查，有 skillId 才展示精确 ID。
