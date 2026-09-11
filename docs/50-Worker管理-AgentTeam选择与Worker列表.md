# AgentTeam选择与Worker列表

## 当前状态
Agent、Team 和 Worker 列表是左侧导航和对话入口的核心。前端从 `/api/agents?includeTeam=true` 的混合扁平列表和嵌套 chat summary 中归并 worker rows，并按当前选择、未读、pending awaiting、active run 等状态展示。

## 核心职责
- 从混合列表按 `kind` 拆分 Agent 与 Team，并生成 worker 列表与切换列表。
- 将 chat 与 agent/team 关联，用于对话定位和未读计数。
- 使用 Team 的 `stats.totalCount` / `stats.unreadCount`，缺失时再按已加载的 Team chat 计算。
- 处理当前 worker、临时 pin、agent mention 和新建对话目标。
- 展示 pending awaiting、active run、最近对话和 worker 状态。

## 核心流程
应用启动、侧栏刷新和 Agent 创建完成后，`useWorkerData` 与 `useWorkerSidebarData` 都以 `includeTeam=true` 拉取混合 `/api/agents`。协调层从 Team 嵌套 chat 补齐 `teamId`，从 Agent 嵌套 chat 补齐 `agentKey`，并保存后端的混排顺序。formatter 将数据归并为 worker rows；左侧默认按时间以各 Agent/Team 最新 chat 的 `updatedAt` 倒序混排，同时间按 `chatId` 稳定排序；无对话项以该后端混排为回退，按名称和临时置顶仍沿用既有规则。

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
- `../src/features/workers/lib/teamUtils.ts`
- `../src/app/layout/LeftSidebar.tsx`
- `../src/features/workers/components/WorkerNavigator.tsx`
- `../src/features/workers/hooks/useWorkerSidebarData.ts`
- `../src/features/workers/lib/workerState.ts`
- `../src/app/layout/sidebar/SidebarSettingsMenu.tsx`

## 统一 Chat 置顶

独立侧栏顶部的 Pinned 共用一组顺序，接纳普通 Agent、CODER、KBASE 和 Team 对话。展开时显示会话标题、所属 Agent/Team、运行/HITL/未读状态；收起时由置顶图标打开列表。Chat 操作菜单支持置顶与取消置顶；拖动手柄或空格、方向键、空格完成组内排序，搜索过滤期间暂停排序。

`useWorkerData` 先读取 `/api/chats/order` 判断支持，再用 `/api/chats?pinned=true` 全量读取置顶摘要。后续 `/api/agents?includeChats=5&includeTeam=true&chatsPinned=false` 在后端截取之前排除置顶，分组预览和收起时的摘要也不重复展示置顶 Chat。Worker 的历史总数、未读计数和 History 搜索仍覆盖完整历史，Agent/Team 本身保留在原列表。

`chatPinnedOrder` 与同一份 `state.chats` 一起投影 UI，不修改对话 `updatedAt`、普通排序或浏览器持久化。修改成功使用后端返回的顺序，随后刷新并补齐原分组；失败提示并重新对账。并发刷新合并为串行重取，请求期间的 live push、重命名、已读与删除不会被较早的置顶摘要覆盖。后端缺少 `pinnedOrder` 或返回 404/501 时保留原侧栏并隐藏置顶操作，其他加载失败保留当前置顶状态。

Desktop 内嵌 Agent/Copilot 页面继续由宿主提供外层侧栏；WebClient 不额外显示第二份导航。
