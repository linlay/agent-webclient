# Agent管理台

## 当前状态
Agent 管理台由 `/agents` 路由进入，页面壳层为 `src/app/pages/agents/index.tsx`，主体为 `AgentConsole`。它面向 agent 定义查看、创建、编辑、排序、删除、打开工作区等管理操作。

## 核心职责
- 展示 agent 列表、状态、来源路径、诊断信息和可编辑详情。
- 支持 admin agent 详情、创建、更新、删除和排序。
- 为 CODER agent 提供 workspace、runtimeConfig、模型配置等编辑入口。
- 与左侧 worker 数据保持一致，写操作后刷新相关缓存。

## 核心流程
进入 `/agents` 后，路由参数决定选中 agent。`AgentConsole` 使用 data client 拉取 admin agents、详情和 editor options。保存或删除后调用对应 admin API，并失效 agents/model options 缓存。

## 边界与非目标
- Agent 管理台编辑的是后端 agent 定义，不负责运行中的 query stream。
- Registry 文件编辑不在 Agent 管理台内完成。
- 前端只展示后端诊断，不自行判定 YAML 或 agent 能力是否有效。

## 相关文件
- `../src/app/pages/agents/index.tsx`
- `../src/features/workers/components/AgentConsole.tsx`
- `../src/features/workers/lib/agentSummary.ts`
- `../src/features/workers/lib/agentOrdering.ts`
- `../src/shared/data/client.ts`
- `../src/shared/data/routedClient.ts`

