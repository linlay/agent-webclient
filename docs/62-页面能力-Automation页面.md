# Automation页面

## 当前状态
Automation 页面由 `/automations` 路由进入。`src/app/pages/automations/index.tsx` 只渲染 `AutomationsRouteContent`；当前 Worker、Agent、Team 的状态适配以及 `AutomationHistoryConsole`、编辑器、Execution 历史和领域运行时均位于 `src/features/automations/`。页面采用 history-first 信息架构：左侧选择 Automation，右侧首先查看最近触发及其结果；配置编辑和 Execution 查看都在当前页面的右侧 Drawer 中完成。

## 核心职责
- 展示 automation 列表，并按启用中/已暂停分组；每项显示调度、Agent/Team 和最近一次触发。
- 按日期时间轴展示最近 Execution，覆盖 `running/success/failed/canceled` 四种状态、耗时和单行结果摘要。
- 每条 Execution 行右侧固定显示“详情 / Detail”，包括无结果或无关联 Chat 的执行；点击后立即打开右侧 Drawer，并行按需加载完整执行结果和关联 Chat 快照。
- 完整 `resultContent` 继续复用 `MarkdownContent`；历史 Chat 使用 `buildChatReplayProjection` 和现有 Timeline 展示模型渲染，不通过列表接口读取完整助手输出。
- 支持创建和编辑 cron、zoneId、remainingRuns、agentKey 与 query payload；description、zoneId、query.role、query.hidden 均可省略。
- 支持启停、复制、删除自动化，并在选中项详情区的“更多设置”菜单提供“立即触发”；不提供伪造的 `/api/query` 单次运行或失败重试入口。
- 为 message、role、hidden 和 params JSON 提供前端表单编辑与基本校验。

## 核心流程
进入 `/automations` 后，页面通过 `POST /api/automations` 加载配置列表和 `executionHistory` 服务状态，默认选中第一条 Automation；History 可用时通过 `POST /api/automation/executions` 按 20 条分页加载当前 Automation 的历史。分页根据 `executionId` 去重，切换、分页和详情请求均使用请求序号忽略迟到响应。

页面订阅 `automation.execution.created/updated/completed`：当前 Automation 的事件会防抖刷新第一页和列表摘要，其他 Automation 的事件只刷新左栏摘要；事件明确匹配正在查看的 Execution 时，还会防抖重读 Execution Detail 和 Chat snapshot。`initializing/unavailable` 会显示明确的 History 提示且不影响配置操作；`degraded` 继续展示仍可读取的历史。历史接口 503 只隔离右侧历史，不伪装成空记录。

左栏列表项只负责选择 Automation；选中启用或暂停项后，可在详情区“更多设置”菜单通过 HTTP `POST /api/automation/trigger` 提交 `{id}`。触发中的菜单项会禁用并显示 loading，不锁住详情区其他操作；成功仅提示“已触发”并静默刷新摘要，最终状态继续由 execution push 驱动。触发失败只显示动作 toast，不污染列表或 History 错误态；旧 Platform 返回 404 时提示当前 Platform 不支持立即触发或该 Automation 已不存在。

Execution 行采用 44px 单行布局，只显示时间、状态、耗时、截断摘要和右侧“详情 / Detail”。不再提供展开交互或展开区；完整时间、Run ID、finish reason 和错误信息统一在详情 Drawer 中查看，无结果的执行也可打开详情。窄屏隐藏耗时，摘要继续单行截断，保留详情入口。

Execution Drawer 使用 `POST /api/automation/execution` 读取完整结果，并使用现有 `getChat(chatId, false)` 读取关联 Chat。桌面与窄屏统一使用“结果 / 对话”页签，默认展示结果，两种内容不再并排挤占阅读宽度。两者分别维护 loading、error 和重试状态，切换页签不重新请求已加载数据。

“结果”用完整可用宽度展示 `resultContent`，正文最大宽度 960px 并居中；标题、状态、时间与耗时合并为一行，页签行右侧只保留复制和详情图标，不显示额外说明文案。错误信息保持直接可见，Agent/Team 身份、完整时间、耗时、结束原因、Execution ID、Run ID 和触发指令通过详情图标的点击浮层查看。“对话”展示完整只读时间线；历史事件通过 `buildChatReplayProjection` 解释，经 `ConversationPreview → ConversationStage` 复用时间线、Markdown、工具和任务分组展示；所有 Run 按 Chat 原始顺序呈现，不根据当前 Execution 过滤、定位或增加专属装饰。

Drawer 不改变页面 URL、Desktop 外层路由、主 Chat 或已读状态，不调用 query、attach、detach，也不提供“打开对话”、Composer、重发、反馈、编辑、派生或运行控制。running Execution 只展示 `/api/chat` 返回的当前快照，不创建 live observer。切换 Execution 或关闭 Drawer 会使旧请求失效，迟到响应不会覆盖当前查看内容。

新建和编辑均在约 `min(680px, 100vw)` 的右侧 Drawer 中复用 `AutomationEditor`，保留结构化/源码编辑、Cron 常用项、校验、启停和删除能力，并在关闭前检查未保存修改。编辑器只按目标 ID 加载详情，不重复读取 Automation 列表。命令抽屉/弹窗与页面都复用 feature 中的 `AutomationHistoryConsole`，不存在第二套字段与 payload 规则；旧 `AutomationModal` 列表/Execution 模式已删除。

桌面左栏固定约 288px；860px 以下改为上下布局，列表限制高度并独立滚动；560px 以下进一步收紧 Execution 列。Execution Drawer 从右侧打开，桌面端宽度为 `min(1180px, calc(100vw - 24px))`，860px 以下占满窗口。标题与页签固定，当前内容区域独立滚动；切换 Execution 时回到“结果”并关闭详情浮层。

结构化编辑器通过“运行权限”选择 `query.accessLevel`：`default`、`auto_approve`、`full_access`。新建任务和旧配置缺省显示默认权限；创建、编辑、源码回读与复制任务保留该字段。定时和立即触发均按保存的权限启动，不继承所选 Chat 的历史权限；运行中调整不会修改任务配置。自动批准仍可能需要写入或破坏性操作审批，目标准入与平台硬限制继续生效。

## 边界与非目标
- Automation 调度、cron 解释、执行上下文和失败重试由后端负责。
- 前端不生成自动化执行计划，也不调用普通 `/api/query` 模拟单次运行或重试。
- Automation 管理接口（包括原生立即触发）固定走 HTTP，不随对话 WebSocket transport 路由。
- 完整结果只存在于单条 Execution 详情响应，历史列表只消费 `hasResult/resultPreview`。
- Execution Drawer 是 Automation 页面内部临时状态，不支持刷新恢复、深链接或独立 Execution 路由。
- 省略 `query.role` 时按 `automation` 执行，省略 `query.hidden` 时默认隐藏该 query 消息；显式 `hidden: false` 才在 Chat 时间线显示。省略 `zoneId` 时跟随 Platform 当前时区。

## 相关文件
- `../src/app/pages/automations/index.tsx`
- `../src/features/automations/components/AutomationsRouteContent.tsx`
- `../src/features/automations/components/AutomationHistoryConsole.tsx`
- `../src/features/automations/components/AutomationHistoryConsole.module.css`
- `../src/features/automations/components/AutomationEditor.tsx`
- `../src/features/automations/components/AutomationEditorDrawer.tsx`
- `../src/features/automations/components/AutomationExecutionDrawer.tsx`
- `../src/features/automations/hooks/useAutomationHistoryRuntime.ts`
- `../src/features/automations/hooks/useAutomationEditorRuntime.ts`
- `../src/features/automations/lib/automationForm.ts`
- `../src/features/conversation/components/ConversationPreview.tsx`
- `../src/features/timeline/components/TimelineRenderEntryView.tsx`
- `../src/features/automations/lib/executionView.ts`
- `../src/shared/data/api/http.ts`
- `../src/shared/data/api/routedClient.ts`
- `../src/shared/data/api/endpoints.ts`
- `../src/shared/data/api/client.test.ts`
