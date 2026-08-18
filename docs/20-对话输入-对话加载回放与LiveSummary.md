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

`useChatReadSync` 独立同步已读状态，worker 选择逻辑位于 workers 模块。`/agent/:agentKey?newChat=` 的首条 query 仅在收到稳定 `chatId` 后将路由 replace 为 `?chatId=`；这是同一 live query 的一次性 session promotion，不是历史对话打开。`AgentChatShell` 消费 promotion 后只收敛 URL 和选中态，不派发 `agent:load-chat`；`useConversationActions.loadChat()` 也会在目标 chat 已由活跃 live query 消费时直接返回，不拉取 `/api/chat`、不 reset timeline、也不派发 attach。

当前对象历史与全局历史是两个独立入口。Copilot 顶栏、`/history` Composer 命令和全局快捷操作通过 Command Overlay 打开当前 Agent/Team 的历史抽屉：Agent 历史使用 `GET /api/chats?agentKey=...`，选择记录后派发 `agent:load-chat` 并在当前壳层内切换。全局聊天历史独立使用 `/history`，以无参数 `GET /api/chats` 获取全量摘要，并在前端按关键词、`updatedAt` 自然日范围和 Agent/Team 归属组合筛选；Agent-owned 记录只输出 `/agent/:agentKey?chatId=...`。Overview、Debug、Planning、Source、Artifact、Reference 的 URL 定位字段不会传给后端；它们只调用 `GET /api/chat?chatId=...`，再从同一 replay 投影按各自稳定 ID 定位。缺少或无效 ID 显示无效目标，不回退到其他节点或最新 Run。

Agent Copilot 使用相同的稳定对话身份规则：新对话收到稳定 `chatId` 后将 `/copilot/:agentKey` replace 为 `/copilot/:agentKey?chatId=<id>`，只收敛 URL，不重新加载正在消费的 live query。用户选择历史 chat 时先让既有 `agent:load-chat` 完成一次加载并同步 URL；点击新对话或切换 Agent 时立即清除旧 `chatId`。这些导航保留 `lang`、`theme`、`hostTheme`、`wsSource` 等宿主参数。Desktop 只被动镜像 URL，不读取 query 流 payload。

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
- `../src/features/chats/lib/chatSummary.ts`
- `../src/features/chats/lib/chatSummaryLive.ts`
- `../src/features/runs/lib/runAgentIdentity.ts`
- `../src/features/chats/components/ChatItem.tsx`
