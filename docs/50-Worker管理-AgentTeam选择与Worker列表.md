# AgentTeam选择与Worker列表

## 当前状态
Agent、Team 和 Worker 列表是左侧导航和会话入口的核心。前端从 `/api/agents`、`/api/teams`、chat summary 中归并 worker rows，并按当前选择、未读、pending awaiting、active run 等状态展示。

## 核心职责
- 拉取 agents 和 teams，并生成 worker 列表与切换列表。
- 将 chat 与 agent/team 关联，用于会话定位和未读计数。
- 处理当前 worker、临时 pin、agent mention 和新建会话目标。
- 展示 pending awaiting、active run、最近会话和 worker 状态。

## 核心流程
应用启动和侧栏刷新时，`useWorkerData` 与 layout hook 拉取 agents、teams、chats。formatter 将数据归并为 worker rows，左侧侧栏根据当前路由和状态决定选中项、预览会话和操作菜单。

## 边界与非目标
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

