# Automation页面

## 当前状态
Automation 页面由 `/automations` 路由进入，页面入口是 `src/app/pages/automations/index.tsx`，主体复用 `AutomationModal`。它面向自动化列表、详情、创建、编辑、启停、删除和执行记录查看。

## 核心职责
- 展示 automation 列表，并支持搜索、enabled/disabled 过滤和当前 worker 默认 agent 推导。
- 支持创建和编辑 cron、zoneId、remainingRuns、agentKey/teamId 与 query payload；description、zoneId、query.role、query.hidden 均可省略。
- 支持启停、删除自动化，并展示自动化详情与最近执行记录。
- 为 message、role、hidden 和 params JSON 提供前端表单编辑与基本校验。

## 核心流程
进入 `/automations` 后，`AutomationsPage` 从全局状态解析当前 worker，并把 agents、teams 传入 `AutomationModal`。控制台调用 automation list/detail/executions 接口加载数据；用户保存时根据 create/edit 模式构造请求，启停和删除直接调用对应管理接口。

Automation 列表卡片按两行结构渲染：第一行展示 automation `name` 与启用/停用 tag；第二行展示智能体名（或团队名）与 cron 表达式。`nextFireTime` 与 `lastExecution` 不再在卡片上展示，相关字段保留在右侧详情面板与执行记录区域。

右侧结构化编辑器与 Agent 管理台保持一致，采用无外围边框的扁平分组和吸顶锚点，内容滚动会同步更新当前锚点。两个区域固定为：

- **属性**：名称、Cron 与常用、智能体、时区、剩余次数、启用状态、描述。
- **执行**：最近执行记录与刷新入口；新建状态展示保存后可查看记录的空状态。

吸顶锚点栏使用短词导航（中文「属性 / 执行」，英文 "Properties / Executions"），右侧提供源码切换、启停与「图标 + 保存」按钮（创建态按钮提示为“创建自动化”，保存按钮与相邻图标按钮等高）。智能体下拉的每个选项在一行内展示 Agent 图标、名称与角色（角色为小字淡色，无角色时不显示），选中后显示图标与名称；Cron 常用（原「快捷选择」）是点击即赋值的动作菜单——点击某个预设直接把 cron 写入表单，无选中态、不渲染为下拉选项。常用预设共 7 项：每天 19:00、工作日 09:30、每 10 分钟、每 8 小时、晚上 22:10（仅一次）、周末 09:00、21:00、每月 5、15、25 日 12:00；其中「晚上 22:10（仅一次）」在写入 cron（`10 22 * * *`）的同时把「剩余次数」联动设为 1，真正只执行一次。cron 自然语言描述支持小时列表（如 `0 9,21 * * 0,6` 显示为「周末 09:00、21:00」）。

桌面端普通短字段使用三列布局，消息、描述和 Params 等长内容保持完整行宽；窄屏降为单列。保存按钮位于吸顶锚点栏最右侧，源文件编辑模式不显示结构化锚点。

## 边界与非目标
- Automation 调度、cron 解释、执行上下文和失败重试由后端负责。
- 前端不生成自动化执行计划，也不直接执行 query。
- Automation 管理接口当前固定走 HTTP，不随对话 WebSocket transport 路由。
- 省略 `query.role` 时按 `automation` 执行，省略 `query.hidden` 时默认隐藏该 query 消息；显式 `hidden: false` 才在 Chat 时间线显示。省略 `zoneId` 时跟随 Platform 当前时区。

## 相关文件
- `../src/app/pages/automations/index.tsx`
- `../src/app/modals/AutomationModal.tsx`
- `../src/shared/data/api/client.ts`
- `../src/shared/data/api/routedClient.ts`
- `../src/shared/data/api/endpoints.ts`
- `../src/shared/data/api/client.test.ts`
