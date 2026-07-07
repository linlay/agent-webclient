# 会话加载回放与LiveSummary

## 当前状态
会话列表、加载、回放、live summary 和未读状态由 `src/features/chats/` 负责。它消费 `/api/chats`、`/api/chat`、archive、raw jsonl、mark read 等接口，并把回放事件重新送入 timeline processor。

## 核心职责
- 加载会话摘要并合并运行中会话的 live patch。
- 切换 chat 时恢复 conversation snapshot、timeline、plan、artifacts 和当前 agent 绑定。
- 根据 pending awaiting、active run、未读计数更新 worker 列表展示。
- 支持删除、重命名、归档、标记已读和导出。

## 核心流程
`useChatActions` 拉取会话摘要和详情。详情中的事件按 replay 模式交给事件处理器，生成与 live stream 相同的前端状态。运行中事件会同步更新 chat summary，保证左侧列表和主时间线一致。

## 边界与非目标
- chat store 是后端事实源，前端只做读取、展示和缓存归并。
- replay 不应发起新的 run，也不应改变后端历史。
- worker 侧的会话聚合只服务前端导航，不改后端 team/agent 定义。

## 相关文件
- `../src/features/chats/hooks/useChatActions.ts`
- `../src/features/chats/lib/conversationSession.ts`
- `../src/features/chats/lib/chatSummary.ts`
- `../src/features/chats/lib/chatSummaryLive.ts`
- `../src/features/chats/lib/runAgentIdentity.ts`
- `../src/app/layout/sidebar/ChatItem.tsx`

