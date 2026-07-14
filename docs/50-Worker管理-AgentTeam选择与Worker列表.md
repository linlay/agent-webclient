# AgentTeam选择与Worker列表

## 当前状态
Agent、Team 和 Worker 列表是左侧导航和会话入口的核心。前端从 `/api/agents?includeTeam=true` 的混合扁平列表和嵌套 chat summary 中归并 worker rows，并按当前选择、未读、pending awaiting、active run 等状态展示。

## 核心职责
- 从混合列表按 `kind` 拆分 Agent 与 Team，并生成 worker 列表与切换列表。
- 将 chat 与 agent/team 关联，用于会话定位和未读计数。
- 使用 Team 的 `stats.totalCount` / `stats.unreadCount`，缺失时再按已加载的 Team chat 计算。
- 处理当前 worker、临时 pin、agent mention 和新建会话目标。
- 展示 pending awaiting、active run、最近会话和 worker 状态。

## 核心流程
应用启动、侧栏刷新和 Agent 创建完成后，`useWorkerData` 与 layout hook 都以 `includeTeam=true` 拉取混合 `/api/agents`。协调层从 Team 嵌套 chat 补齐 `teamId`，从 Agent 嵌套 chat 补齐 `agentKey`，并保存后端的混排顺序。formatter 将数据归并为 worker rows；默认按时间顺序保持该后端顺序，按名称和临时置顶仍沿用既有规则。

## 边界与非目标
- `scope`、`mode` 仅筛 Agent；Copilot 路由是否回退到 nav scope 也只看 Agent 数量，不能被始终返回的 Team 阻止。
- Agent/Team 选择只是前端路由提示，后端仍负责最终运行上下文。
- Worker 列表不是 registry 编辑器；Agent 管理台和 Registry 管理台另有专题。
- 未读和 pending awaiting 展示只服务导航，不修改后端协议。

## 相关文件
- `../src/features/workers/hooks/useWorkerData.ts`
- `../src/features/workers/lib/workerListFormatter.ts`
- `../src/features/workers/lib/workerConversationFormatter.ts`
- `../src/features/workers/lib/teamUtils.ts`
- `../src/app/layout/LeftSidebar.tsx`
- `../src/app/layout/hooks/useLeftSidebarData.ts`
