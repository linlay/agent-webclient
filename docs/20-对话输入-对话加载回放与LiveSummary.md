# 对话加载回放与LiveSummary

## 当前状态

历史聊天目录、live summary、未读状态和 CRUD UI 由 `src/features/chats/` 负责；当前对话加载、切换、快照和回放由 `src/features/conversation/` 负责。回放事件与实时事件共用 `src/features/events/` 的纯投影入口。

## 核心职责

- 加载对话摘要并合并运行中对话的 live patch。
- 切换 chat 时恢复 conversation snapshot、timeline、plan、artifacts 和当前 agent 绑定。
- replay 后用 `/api/chat.awaiting` 校准 Composer 的唯一可操作等待态。
- 根据 pending awaiting、active run、未读计数更新 worker 列表展示。
- 支持删除、重命名、归档、标记已读和导出。

## 核心流程

`useConversationActions` 拉取对话详情，并把详情事件按 replay 模式交给事件处理器；`useConversationEventHandler` 处理实时事件。两条路径生成相同的 `EventCommand`，再分别由 replay/live adapter 应用。历史 replay 完成后，`reconcileReplayAwaiting` 读取顶层 `/api/chat.awaiting`：没有顶层等待项时清空 replay 产生的活动队列；存在时按 `runId + awaitingId + mode` 精确匹配完整 ask，planning 先映射为前端 plan。该校准只改变 Composer 操作态，不删除历史 events 或 debug timeline；协议不一致时记录诊断并保持输入框解锁。

`useChatReadSync` 是单 Chat 自动已读的唯一业务入口，worker 选择逻辑位于 workers 模块。`loadChat()` 只在请求仍匹配 `chatLoadSeq + targetChatId` 时，把 `/api/chat` 顶层的 owner、`lastRunId/lastRunContent` 与完整 `read` summary 同 replay Timeline 放进一次 React 提交；因此由 Desktop Cmd+K、Sidebar 或外部路由打开、此前不在 `state.chats` 的 Chat 也具有权威 read 基线。Hook 只有在目标仍为当前 Chat、切换已经进入 `ready`（无切换事务的 active live Chat 视为已提交）且 `read.isRead === false` 时才发送 `/api/read`，并按 `chatId + lastRunId + readRunId` 去重。已读、请求失败、过期切换和内容尚未提交的路由变化都不写 read；当前可见 Chat 收到更新 Run 的 `chat.unread` 后，新 `lastRunId` 会形成新的唯一触发键。`/api/chat` 详情与 `chat.read/chat.unread` Push 通过 `readAt/readRunId` 和 Platform `RunIDAfter` 语义合并，较旧详情不得覆盖较新的 Push；`chat.read` 不把 `readAt` 写入 Chat `updatedAt`。

`/agent/:agentKey?newChat=` 的首条 query 仅在收到稳定 `chatId` 后将路由 replace 为 `?chatId=`。promotion 标记只说明导航来源，不是数据已加载的证据。会话领域统一协调 Router、历史选择、恢复和重试；只有目标已提交，或确有目标原始 live query 时才可免历史请求。live 数据尚未绑定目标时仍保留有期限的事务；attach 不能充当原始 query。壳层不再通过“登记过路由”或自行消费标记来跳过加载，也不依赖整个 AppContext 重复派发选中态更新。

### Chat 切换事务

历史切换由 `AppState.chatTransition` 表示，阶段固定为 `loading → applying → restoring → ready`，失败进入 `error`。事务身份使用全局递增的 `chatLoadSeq`，所有请求结果、重试、原子应用和滚动恢复都必须同时匹配 `seq + targetChatId`；较早的 A→B 请求即使晚于 A→C 返回，也不能再修改可见状态。

收到 Router 目标时就登记事务，而非等待 Agent 初始化或历史请求发出。准备期限覆盖初始化、请求重试、数据应用和 live 接管；重复渲染或同目标请求不得重置截止时间。超过期限进入当前目标的可重试错误态，旧请求结果失效且调用方等待结束，不销毁共享传输或中断其他 Chat 的 Run。重新激活按绝对截止时间校验；重试创建新事务，不自动回到来源 Chat。滚动恢复使用独立期限，不能把准备失败伪装成恢复成功。

会话 Surface 的共享展示层由 Router 目标、事务和实际 Chat 归属共同决定。timeline、artifact、plan-tasks 以及顶部 Chat 信息统一占位、保持和淡出；输入框保留但禁用，来源内容不可点击、聚焦或通过快捷键、语音、awaiting 提交。路由目标不匹配时首帧就遮蔽内容，即使旧事务已 ready/error 也不能覆盖新目标的判断。timeline 保持挂载以测量布局和恢复滚动；产物和计划真实面板在遮蔽期间不展示。自动已读同样等待共享遮蔽结束。共享 UI 时钟不拥有数据加载状态，领域模块不得通过依赖壳层形成反向依赖。

切换开始时，`useConversationActions` 先通过 AppContext 中的 viewport handle 同步保存来源 Chat 阅读位置，再创建事务。跨 Chat 请求保留来源 timeline 的布局，不再用 `streaming=true` 模拟历史加载，也不提前清空事件；共享展示层在 Router 同步提交首帧立即遮蔽三个内容区域。Chat ID、reset、replay 投影和 `currentChatActiveRun` 在同一个 `flushSync` 批次内应用，目标缺失的字段显式清空。即使目标存在有效 activeRun，跨 Chat 仍须完成恢复与统一骨架退出；只有归属一致的同 Chat 活动刷新才从开始到结束保持 `background`，不能由新目标的 activeRun 将跨 Chat 事务提前改为后台模式。

历史 Chat 优先复用数据与布局签名均匹配的 Virtuoso snapshot；否则按 anchor key、后邻 key、前邻 key和合法 index 恢复保存的 offset。bookmark 缺失、签名不匹配或候选位置无法解析时确定性回到对话最后。中部 anchor 与保存 offset 的误差不超过 1px、底部实际到达末端，并连续两个动画帧稳定后，事务立即进入 `ready`。恢复 Effect 因数据、布局或书签依赖变化而 cleanup 时，只取消本轮 RAF 与定时器；同一 `seq + targetChatId` 必须使用剩余时间重新进入恢复，不得提前写入完成标记或重置总期限。从事务首次进入 `restoring` 起最多等待 2000ms，超时后保留当前最佳滚动位置并强制进入 `ready`，只牺牲滚动精度，不进入错误或请求重试流程。骨架从首次挂载起完整保持至少 160ms；位置提前 ready 时等待满 160ms 后开始 80ms 渐隐，位置更晚 ready 时立即开始 80ms 渐隐；`prefers-reduced-motion` 下满足位置与 160ms 条件后直接移除。新目标会取消旧目标的 restore RAF、恢复超时与 hold/fade timer。加载错误立即改为可重试错误层，不受最短显示时长限制。诊断使用 `chat-scroll-restore-start`、`chat-scroll-restore-fallback-bottom`、`chat-scroll-restore-timeout` 和 `chat-scroll-restore-ready`。

new Chat 首次创建、数据归属一致的 canonical promotion 与有效同 Chat 后台恢复保留实时内容。只有原始 query 拥有目标且可见数据已经绑定该目标时，协调器才清除竞态创建的历史事务，使其迟到响应失效；时间线不再自行决定取消数据事务。失败时来源数据继续保留但不可见，重试创建新事务，不提交空目标会话。

`forceReload` 使用 `same-chat-reload` 并执行同样的保存与恢复。新建空白对话会先保存来源位置、取消当前事务，再 reset；新 Chat 获得 canonical `chatId` 的 session promotion 仍须验证原始 live query 所有权和数据归属。共享展示层阻塞期间（包括退出动画与错误），Composer 及旧的 awaiting、plan、frontend tool 交互均不可提交；有效同 Chat 后台刷新不额外阻塞交互。聚焦 Composer 使用 `preventScroll`，不可使仍被遮蔽的内容获得焦点。

导出与公开分享不复用上述 replay/live 状态。Markdown 直接请求 Agent Platform；WebClient HTML 导出并行请求 Platform Snapshot 与同源模板后用 Blob parts 组装，Desktop 分享则由常驻 Worker 请求 Snapshot 与 WebClient 模板。公开 `/share/` 由 Tunnel 直接返回已生成的 HTML 主文档。所有路径都不 attach active run，也不从当前 renderer timeline 重建快照。

当前对象历史与全局历史是两个独立入口。Copilot 顶栏、`/history` Composer 命令和全局快捷操作通过 Command Overlay 打开当前 Agent/Team 的历史抽屉：Agent 历史使用 `GET /api/chats?agentKey=...`，选择记录后派发 `agent:load-chat` 并在当前壳层内切换。全局聊天历史独立使用 `/history`，以无参数 `GET /api/chats` 获取全量摘要，并在前端按关键词、`updatedAt` 自然日范围和 Agent/Team 归属组合筛选；Agent-owned 记录只输出 `/agent/:agentKey?chatId=...`。Overview、Debug、Planning、Source、Artifact、Reference 的 URL 定位字段不会传给后端；它们只调用 `GET /api/chat?chatId=...`，再从同一 replay 投影按各自稳定 ID 定位。缺少或无效 ID 显示无效目标，不回退到其他节点或最新 Run。

Agent Copilot 使用相同的稳定对话身份规则：新对话收到稳定 `chatId` 后将 `/copilot/:agentKey` replace 为 `/copilot/:agentKey?chatId=<id>`，有效原始 live query 不重复回放。历史选择和 Router 目标进入同一个会话协调入口，兼容 `agent:load-chat` 事件不维护另一套加载判定；点击新对话或切换 Agent 时清除旧 `chatId`。这些导航保留 `lang`、`theme`、`hostTheme`、`wsSource` 等宿主参数。Desktop 只被动镜像 URL，不读取 query 流 payload。

## 边界与非目标

- chat store 是后端事实源，前端只做读取、展示和缓存归并。
- replay 不应发起新的 run，也不应改变后端历史。
- 历史 `awaiting.ask` 不能单独恢复活动卡片；只有匹配的顶层 awaiting 才能锁定 Composer。
- worker 侧的对话聚合只服务前端导航，不改后端 team/agent 定义。

## 相关文件

- `../src/features/conversation/hooks/useConversationActions.ts`
- `../src/features/conversation/lib/conversationReplay.ts`
- `../src/features/conversation/hooks/useConversationEventHandler.ts`
- `../src/features/conversation/lib/conversationSession.ts`
- `../src/features/conversation/lib/chatTransition.ts`
- `../src/features/chats/lib/chatSummary.ts`
- `../src/features/chats/lib/chatSummaryLive.ts`
- `../src/features/runs/lib/runAgentIdentity.ts`
- `../src/app/layout/sidebar/WorkerConversationPreviewList.tsx`
- `../src/app/layout/sidebar/WorkerChatPreviewItem.tsx`
