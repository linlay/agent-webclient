# Automation页面

## 当前状态
Automation 页面由 `/automations` 路由进入，页面入口是 `src/app/pages/automations/index.tsx`，主体复用 `AutomationModal`。它面向自动化列表、详情、创建、编辑、启停、删除和执行记录查看。

## 核心职责
- 展示 automation 列表，并支持搜索、enabled/disabled 过滤和当前 worker 默认 agent 推导。
- 支持创建和编辑 cron、zoneId、remainingRuns、agentKey/teamId 与 query payload。
- 支持启停、删除自动化，并展示自动化详情与最近执行记录。
- 为 message、role、hidden 和 params JSON 提供前端表单编辑与基本校验。

## 核心流程
进入 `/automations` 后，`AutomationsPage` 从全局状态解析当前 worker，并把 agents、teams 传入 `AutomationModal`。控制台调用 automation list/detail/executions 接口加载数据；用户保存时根据 create/edit 模式构造请求，启停和删除直接调用对应管理接口。

## 边界与非目标
- Automation 调度、cron 解释、执行上下文和失败重试由后端负责。
- 前端不生成自动化执行计划，也不直接执行 query。
- Automation 管理接口当前固定走 HTTP，不随对话 WebSocket transport 路由。

## 相关文件
- `../src/app/pages/automations/index.tsx`
- `../src/app/modals/AutomationModal.tsx`
- `../src/shared/data/client.ts`
- `../src/shared/data/routedClient.ts`
- `../src/shared/data/endpoints.ts`
- `../src/shared/data/client.test.ts`
