# AgentTeam选择与Worker列表

## 当前状态
Worker 是对话选择和历史归属的内部模型，继续兼容 Agent 与 Team。独立左侧导航展示普通对话和项目：Agent 的 `workspaceDir` 去除首尾空白后非空即归入项目，不按名称或 CODER/KBASE 模式分类。置顶、未读、pending awaiting、active run 等状态继续消费现有协议。

会话预览与 Worker 预览在 pending awaiting 时只显示对应等待标签，不同时显示 running 动画图标；没有 awaiting 的运行中会话仍显示 running 图标。此规则仅控制展示，不改变 awaiting 所属 Run 的活动状态、运行控制或导航关注状态。

## 核心职责
- 从混合列表按 `kind` 拆分 Agent 与 Team，并生成 worker 列表与切换列表。
- 将 chat 与根 Agent（包括 TEAM）关联，用于对话定位和未读计数。
- 使用 Team 的 `stats.totalCount` / `stats.unreadCount`，缺失时再按已加载的 Team chat 计算。
- 处理当前 worker、临时 pin、agent mention 和新建对话目标。
- 展示 pending awaiting、active run、最近对话和 worker 状态。

## 核心流程
应用启动、侧栏刷新和 Agent 创建完成后，`readSidebarAgents` 并行读取 `scope=nav&hasWorkspace=false` 的普通 Agent 和 `hasWorkspace=true` 的完整项目目录，均不包含 Team。项目请求不设置 nav scope，避免排除有工作目录的 KBASE Agent。两份目录各携带 `includeChats=5&chatsPinned=false`；协调层保留后端顺序、补齐嵌套摘要的 owner。Team 的模型和历史归属仍保留，Copilot scope 与回退规则继续按 Agent 数量判断。

导航目录与当前智能体详情在数据结构上分离。`agents: AgentSummary[]` 保存 `/api/agents` 的导航快照，`currentAgent: Agent | null` 独立保存 `/api/agent` 的当前定义；列表刷新只替换导航集合，不合并、清空或覆盖当前定义，列表中的同名字段也不能覆盖当前定义。New Chat、导航刷新和创建 Agent 后的刷新均遵守此边界，不依赖请求到达顺序。

当前智能体的名称、模式、模型、权限、连接器、技能、交互开关与 Workspace 等元数据只读匹配当前 owner key 的 `currentAgent`。详情未加载或 key 不匹配时保持待加载，不以导航条目补成详情。切换与历史归属仍以 Chat/显式选择为准；同 Agent 的 New Chat 保留独立详情。详情读取和经服务端确认的配置变更使用专门 action 更新当前定义，身份清理同时清理当前定义。导航成员删除本身不删除历史 Chat 当前定义，详情查询失败与可用性门禁负责表达真实不可用状态。

`SidebarAgentNavigation` 默认以 `state.workerRows` 顺序展示项目。项目标题与普通对话行左侧对齐，项目内会话只增加 12px 缩进，各项目可独立展开。普通 Agent 通过“对话”标题内的选择器作为新对话目标；按时间/名称排序控制位于新对话图标前，只排序普通会话预览。

Projects、各 Project 内的 Chats、普通 Chats 与 Bots 均支持直接拖动现有行进行组内排序，不增加拖拽按钮；项目只从标题行拖动，聊天行不会触发项目拖动。目标行上／下半部决定插入前／后，拖动显示插入线，取消时保留原顺序；聚焦行后也可用 `Alt+↑/↓` 调整。更多菜单和新建按钮保持原交互。手动顺序作为当前浏览器偏好存入 localStorage，按后端身份和列表（含 project Agent key）隔离，刷新与折叠后保留；新增项沿用默认顺序追加，分页或临时不可见项不丢失已存位置。普通 Chats 重新选择按时间／名称排序会清除其手动顺序。拖拽不跨组移动，不修改 Chat owner、Agent 管理顺序、后端置顶协议或 History。

普通预览独立请求 `/api/chats?hasWorkspace=false&pinned=false`，初始显示 8 条，每次“查看更多”增加 8 条，最多 24 条。项目初始显示 5 条，每次增加 5 条，最多 20 条；展开请求使用 `agentKey` 和 `pinned=false`。分页多读取 1 条判断是否还有下一批，不改变完整历史目录。过期目录和乱序响应被丢弃，合并摘要时保留运行态并按当前平台置顶顺序校准。

“显示历史”始终可用，普通入口与全局历史事件默认全部 Agent，项目入口显式预选对应 Agent。历史请求不携带预览 limit 或 pinned 过滤。

顶部依次展示新建对话、知识库、记忆和自动化，沿用现有功能开关。智能体管理入口位于 Settings。顶部搜索图标调用已有 Cmd+K 全局搜索，不再维护侧栏搜索行。

## 边界与非目标
- `scope`、`mode` 仅筛 Agent；Copilot 路由是否回退到 nav scope 也只看 Agent 数量，不能被始终返回的 Team 阻止。
- Agent/Team 选择只是前端路由提示，后端仍负责最终运行上下文。
- Worker 列表不是 registry 编辑器；Agent 管理台和 Registry 管理台另有专题。
- `features/workers` 只负责 Agent/Team 选择、会话列表、Worker view model 和工作区入口；Agent CRUD、ZIP 导入、专属 Skill、源码编辑和项目创建实现归 `features/agents`。
- 跨领域设置菜单由 `app/layout/sidebar` 组合，`WorkerNavigator` 只消费菜单 slot 与打开动作，不解释 Memory、Archive、Registry 或 Settings 路由。
- 未读和 pending awaiting 展示只服务导航，不修改后端协议。

## 相关文件
- `../src/features/workers/hooks/useWorkerData.ts`
- `../src/features/workers/lib/workerListFormatter.ts`
- `../src/features/workers/lib/workerConversationFormatter.ts`
- `../src/app/layout/LeftSidebar.tsx`
- `../src/features/workers/components/WorkerNavigator.tsx`
- `../src/features/workers/hooks/useWorkerSidebarData.ts`
- `../src/features/workers/hooks/useSidebarChatPreviews.ts`
- `../src/features/workers/lib/sidebarAgentData.ts`
- `../src/features/workers/lib/sidebarNavigation.ts`
- `../src/features/workers/components/SidebarAgentNavigation.tsx`
- `../src/features/workers/lib/workerState.ts`
- `../src/app/layout/sidebar/SidebarSettingsMenu.tsx`

## 主要对话模式

独立导航的放大镜右侧提供「主要对话模式」切换按钮，按下态和本地偏好记录当前视图。模式切换只改变导航，不修改 Chat owner、主要对话指针或当前已打开的对话。主要模式下每个 Agent 一行，沿用自有 `AgentIcon`，显示名称、主要对话最近回复，以及运行、HITL 或未读状态；收起侧栏后仍直接打开同一个主要对话。自动化、知识库、记忆等原有工具入口保留，不显示「新建对话」或项目内的新建按钮。

主要对话身份只取 `/api/agents` 的 `primaryChat`，不由最近会话、置顶或预览列表推断，不受 `includeChats=5` 和 `chatsPinned=false` 限制；摘要合入共享 Chat 状态，实时 Push 更新回复和运行状态。普通导航仍按原预览顺序展示。`chat.primary.changed` 会失效导航缓存并刷新目录，归档、删除也重新对账指针。

已有 Primary 的 Agent 点击名称只触发 `agent:load-chat` 加载其 `primaryChat.chatId`，沿用该 Chat 继续聊天，不进入 New Chat，也不修改 Primary 指针。没有 Primary 的 Agent 显示「暂无对话」，点击可进入 New Chat；仅这类 Agent 在主要模式首次 query 时发送 `primary:true`，包含上传占位 Chat 的首次发送。已有 Chat 的后续 query 不重复携带该字段，活动 Run 与指针争用仍由 Platform 校验。通过「显示历史」仍可查看全部会话，切回完整导航恢复 Pinned、普通对话与项目分组。

## 统一 Chat 置顶

置顶区展示在机器人分组上方，展开与收起导航保持相同顺序。机器人分组提供与对话／项目一致的标题和折叠入口；机器人菜单支持置顶／取消置顶，置顶后从分组移到统一置顶区。机器人置顶按 Agent key 保存到按后端身份隔离的 localStorage，与普通 Chat 的平台置顶独立；可置顶尚无主聊天的机器人，点击仍使用最新 Platform primaryChat 指针或进入首次发送流程，重新开始不丢失置顶身份。置顶机器人保留原菜单、状态与直接拖动排序，未置顶机器人保持自己的顺序。

独立侧栏顶部的 Pinned 共用一组顺序，接纳普通 Agent、CODER、KBASE 和 Team 对话。展开时显示会话标题、所属 Agent/Team、运行/HITL/未读状态；收起时由置顶图标打开列表。会话右键菜单或 hover/focus 时显示的更多按钮支持置顶与取消置顶，更多按钮覆盖行尾、不占固定列宽；键盘 Shift+F10 也可打开菜单。拖动手柄或空格、方向键、空格完成组内排序。所有智能体图标继续使用 `AgentIcon` 和原始彩色 SVG 资源。

`useWorkerData` 通过一次 `/api/chats/order` 读取完整有序 `pinnedChats`，与 Desktop 共用相同契约，不再探测能力或追加置顶列表请求。后续 Agent 两类目录的 `includeChats=5&chatsPinned=false` 在后端截取之前排除置顶，普通对话、项目预览和收起时的摘要也不重复展示置顶 Chat。Worker 的历史总数、未读计数和 History 搜索仍覆盖完整历史；导航目录的分类不会修改已有 Chat owner。

`chatPinnedOrder` 与同一份 `state.chats` 一起投影 UI，不修改对话 `updatedAt`、普通排序或浏览器持久化。修改成功使用后端返回的顺序，随后刷新并补齐原分组；失败提示并重新对账。并发刷新合并为串行重取，请求期间的 live push、重命名、已读与删除不会被较早的置顶摘要覆盖。读取响应缺少 `pinnedChats` 或接口失败均作为加载失败处理，保留当前置顶状态；空数组才表示无置顶。`updatedAt` 只标记展示偏好，不能用于跳过摘要刷新，实时 Push 仍继续更新运行态和未读状态。

Desktop 内嵌 Agent/Copilot 页面继续由宿主提供外层侧栏；WebClient 不额外显示第二份导航。

## 当前 Agent 可用性同步

Composer 可用性以全局 agentAvailability 为唯一来源，按 Agent 隔离检查版本，历史 Chat owner 保持不变。query 准入拒绝会同时失效该 Agent 的详情缓存并阻止迟到检查覆盖。当前 Agent 的 catalog.updated、重连、认证恢复和显式重试负责重新校准状态，正常 Platform 窗口切换不产生详情请求。


主要对话导航仅显示智能体的 Primary 摘要，不挂载 openedBy 子 Chat 列表。悬停或键盘聚焦智能体时显示“…”菜单，菜单包含历史聊天、智能体配置与清空主聊天；历史聊天合并该 Agent 自身会话和 `/api/chats?openedBy=<agentKey>` 返回的工作会话，跨 Agent 的子 Chat 也保留入口。清空只允许无活动 Run、无待处理交互的 Primary，确认后复用归档接口并清除 Primary 指针，历史保留在归档；清空当前可见主 Chat 时进入该智能体的新会话，其他 Chat 不受影响。


主要对话模式只作用于显式 `mode: GENERAL` 的智能体，导航不显示“主要对话”标题。其他模式继续展示原有会话／项目分组、置顶、预览和新建入口，展开与折叠导航使用同一范围；普通预览只读取保留在普通导航的 Agent，避免 GENERAL 的最近会话挤占列表。文字和语音的 `primary:true` 创建意图也仅允许 GENERAL，模式缺失时不推断。收件箱入口位于 Settings 菜单，待收取计数复用原有刷新规则；Quick Actions 保持自动化、知识库、记忆三项布局。
