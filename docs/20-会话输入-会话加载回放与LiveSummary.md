# 会话加载回放与LiveSummary

## 当前状态
历史聊天目录、live summary、未读状态和 CRUD UI 由 `src/features/chats/` 负责；当前会话加载、切换、快照和回放由 `src/features/conversation/` 负责。回放事件与实时事件共用 `src/features/events/` 的纯投影入口。

## 核心职责
- 加载会话摘要并合并运行中会话的 live patch。
- 切换 chat 时恢复 conversation snapshot、timeline、plan、artifacts 和当前 agent 绑定。
- 根据 pending awaiting、active run、未读计数更新 worker 列表展示。
- 支持删除、重命名、归档、标记已读和导出。

## 核心流程
`useConversationActions` 拉取会话详情，并把详情事件按 replay 模式交给事件处理器；`useConversationEventHandler` 处理实时事件。两条路径生成相同的 `EventCommand`，再分别由 replay/live adapter 应用。`useChatReadSync` 独立同步已读状态，worker 选择逻辑位于 workers 模块。`/agent/:agentKey?newChat=` 的首条 query 仅在收到稳定 `chatId` 后将路由 replace 为 `?chatId=`；这是同一 live query 的一次性 session promotion，不是历史会话打开。`AgentChatShell` 消费 promotion 后只收敛 URL 和选中态，不派发 `agent:load-chat`；`useConversationActions.loadChat()` 也会在目标 chat 已由活跃 live query 消费时直接返回，不拉取 `/api/chat`、不 reset timeline、也不派发 attach。Desktop 只被动镜像这个 URL，不读取 query 流 payload。

## 边界与非目标
- chat store 是后端事实源，前端只做读取、展示和缓存归并。
- replay 不应发起新的 run，也不应改变后端历史。
- worker 侧的会话聚合只服务前端导航，不改后端 team/agent 定义。

## 相关文件
- `../src/features/conversation/hooks/useConversationActions.ts`
- `../src/features/conversation/hooks/useConversationEventHandler.ts`
- `../src/features/conversation/lib/conversationSession.ts`
- `../src/features/chats/lib/chatSummary.ts`
- `../src/features/chats/lib/chatSummaryLive.ts`
- `../src/features/runs/lib/runAgentIdentity.ts`
- `../src/features/chats/components/ChatItem.tsx`
