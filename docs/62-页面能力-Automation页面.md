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

Automation 列表卡片按两行结构渲染：第一行展示 automation `name` 与启用/停用 tag；第二行展示智能体名（或团队名）与 cron 表达式。`nextFireTime` 与 `lastExecution` 不再在卡片上展示，相关字段保留在右侧详情面板与执行记录区域。

右侧结构化编辑器与 Agent 管理台保持一致，采用无外围边框的扁平分组和吸顶锚点，内容滚动会同步更新当前锚点。三个区域固定为：

- **基本属性**：名称、Cron 与快捷选择、智能体、时区、剩余次数、启用状态、描述。
- **查询参数**：自动化消息、会话 ID、角色、隐藏状态、Params JSON。
- **执行情况**：最近执行记录与刷新入口；新建状态展示保存后可查看记录的空状态。

桌面端普通短字段使用三列布局，消息、描述和 Params 等长内容保持完整行宽；窄屏降为单列。编辑态的“保存修改”只显示在吸顶锚点栏最右侧，创建态仍在表单下方显示“创建自动化”，源文件编辑模式不显示结构化锚点。

## 边界与非目标
- Automation 调度、cron 解释、执行上下文和失败重试由后端负责。
- 前端不生成自动化执行计划，也不直接执行 query。
- Automation 管理接口当前固定走 HTTP，不随对话 WebSocket transport 路由。

## 相关文件
- `../src/app/pages/automations/index.tsx`
- `../src/app/modals/AutomationModal.tsx`
- `../src/shared/data/api/client.ts`
- `../src/shared/data/api/routedClient.ts`
- `../src/shared/data/api/endpoints.ts`
- `../src/shared/data/api/client.test.ts`
