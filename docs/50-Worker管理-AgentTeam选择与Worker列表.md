# AgentTeam选择与Worker列表

## 当前状态
Worker 是对话选择和历史归属的内部模型，继续兼容 Agent 与 Team。独立左侧导航展示普通对话和项目：Agent 的 `workspaceDir` 去除首尾空白后非空即归入项目，不按名称或 CODER/KBASE 模式分类。置顶、未读、pending awaiting、active run 等状态继续消费现有协议。

## 核心职责
- 从混合列表按 `kind` 拆分 Agent 与 Team，并生成 worker 列表与切换列表。
- 将 chat 与根 Agent（包括 TEAM）关联，用于对话定位和未读计数。
- 使用 Team 的 `stats.totalCount` / `stats.unreadCount`，缺失时再按已加载的 Team chat 计算。
- 处理当前 worker、临时 pin、agent mention 和新建对话目标。
- 展示 pending awaiting、active run、最近对话和 worker 状态。

## 核心流程
应用启动、侧栏刷新和 Agent 创建完成后，`readSidebarAgents` 并行读取 `scope=nav&hasWorkspace=false` 的普通 Agent 和 `hasWorkspace=true` 的完整项目目录，均不包含 Team。项目请求不设置 nav scope，避免排除有工作目录的 KBASE Agent。两份目录各携带 `includeChats=5&chatsPinned=false`；协调层保留后端顺序、补齐嵌套摘要的 owner。Team 的模型和历史归属仍保留，Copilot scope 与回退规则继续按 Agent 数量判断。

`SidebarAgentNavigation` 以 `state.workerRows` 顺序展示项目。项目标题与普通对话行左侧对齐，项目内会话只增加 12px 缩进，各项目可独立展开。普通 Agent 通过“对话”标题内的选择器作为新对话目标；按时间/名称排序控制位于新对话图标前，只排序普通会话预览。

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

## 统一 Chat 置顶

独立侧栏顶部的 Pinned 共用一组顺序，接纳普通 Agent、CODER、KBASE 和 Team 对话。展开时显示会话标题、所属 Agent/Team、运行/HITL/未读状态；收起时由置顶图标打开列表。会话右键菜单或 hover/focus 时显示的更多按钮支持置顶与取消置顶，更多按钮覆盖行尾、不占固定列宽；键盘 Shift+F10 也可打开菜单。拖动手柄或空格、方向键、空格完成组内排序。所有智能体图标继续使用 `AgentIcon` 和原始彩色 SVG 资源。

`useWorkerData` 通过一次 `/api/chats/order` 读取完整有序 `pinnedChats`，与 Desktop 共用相同契约，不再探测能力或追加置顶列表请求。后续 Agent 两类目录的 `includeChats=5&chatsPinned=false` 在后端截取之前排除置顶，普通对话、项目预览和收起时的摘要也不重复展示置顶 Chat。Worker 的历史总数、未读计数和 History 搜索仍覆盖完整历史；导航目录的分类不会修改已有 Chat owner。

`chatPinnedOrder` 与同一份 `state.chats` 一起投影 UI，不修改对话 `updatedAt`、普通排序或浏览器持久化。修改成功使用后端返回的顺序，随后刷新并补齐原分组；失败提示并重新对账。并发刷新合并为串行重取，请求期间的 live push、重命名、已读与删除不会被较早的置顶摘要覆盖。读取响应缺少 `pinnedChats` 或接口失败均作为加载失败处理，保留当前置顶状态；空数组才表示无置顶。`updatedAt` 只标记展示偏好，不能用于跳过摘要刷新，实时 Push 仍继续更新运行态和未读状态。

Desktop 内嵌 Agent/Copilot 页面继续由宿主提供外层侧栏；WebClient 不额外显示第二份导航。

## 当前 Agent 可用性同步

Composer 可用性以全局 agentAvailability 为唯一来源，按 Agent 隔离检查版本，历史 Chat owner 保持不变。query 准入拒绝会同时失效该 Agent 的详情缓存并阻止迟到检查覆盖。当前 Agent 的 catalog.updated、重连、认证恢复和显式重试负责重新校准状态，正常 Platform 窗口切换不产生详情请求。
