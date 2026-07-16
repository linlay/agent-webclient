# 流式传输SSE与WebSocket

## 当前状态
对话流支持 SSE 与 WebSocket 两种模式。SSE 运行时在 `queryStreamRuntime.sse.ts`，WebSocket 运行时在 `queryStreamRuntime.ws.ts`，模式读取和持久化由 `transportMode.ts` 负责。连接与帧处理归 transport，attach/detach 和会话观察编排归 conversation 与 runs。

## 核心职责
- 发起 `/api/query` 流式请求并逐事件回调。
- 支持 `/api/attach` 续接已有 run。
- 管理 abort、detach、重试、WebSocket 连接状态和错误展示。
- 将传输细节隐藏在 `QueryStreamExecutor` / `AttachStreamExecutor` 后面。

## 核心流程
Composer 发送消息时解析当前 transport mode，调用对应 executor。所有事件源共享同一个 `useConversationEventHandler` 实例；terminal event 会停止 streaming 并清理 abort controller。切换 chat 时，若原会话仍在流式输出，会按当前模式 detach 或 abort 并保存快照。新建会话收到稳定 `chatId` 的 URL promotion 仍由原 `/api/query` 消费到终态；SSE 与 WebSocket attach 入口会先检查同一 `chatId`、`runId`、owner 是否已由 live query session 观察，若是则记录本地诊断并拒绝第二个 observer。页面刷新或没有 live query session 的运行中稳定 chat 仍允许恰好一次正常 attach。

SSE / WebSocket event 必须带安全整数 epoch-ms `timestamp`。客户端遇到缺失、字符串、秒级、浮点或 `0` 的时间会按 `time_contract_violation` 拒绝该 event，不以本机当前时间生成时间线节点或任务状态。

`/api/btw` 复用 SSE 帧解析和错误映射，但始终走 HTTP SSE，不受主会话 WebSocket 模式影响。BTW 事件进入 feature-owned projection，不进入主会话事件处理器。新发起的 live BTW run 只消费这条 `/api/btw` 流，不并发调用 `/api/attach`；只有 Provider 初始化时从 `sessionStorage` 恢复出的 running run 才会 attach，且每个恢复 run 只 attach 一次。

BTW 的运行控制也与主会话传输模式隔离。BTW Stop 固定以 HTTP `POST /api/interrupt` 发送 `runId` 与其恢复出的 owner：Agent 为 `agentKey`，编排 Team 为仅 `teamId`；即使主会话选择 WebSocket 也不会改走 WS。前端校验响应中的 `accepted`、`status`、`runId` 和 `detail`：仅 `accepted: true` 时才 abort 当前 BTW SSE 并转为空闲；后端拒绝或网络失败时继续消费原 SSE、保持 running 并允许重试。中断响应绑定发起请求时的 runtime、runId 和 AbortController，迟到响应不能停止关闭后重建的新分支。

attach/detach 也使用同一 owner 规则。SSE 和 WebSocket 不会把 Team 成员事件携带的 `agentKey` 写回 session/chat owner；成员事件仍可按 `taskId`、`subAgentKey` 和 `presentation: "task"` 渲染为子任务，主回答归属保持 Team。

关闭 Side question 只销毁该 chat 的前端 session、runtime 与持久化记录，不发送 interrupt，也不 abort 正在消费的 SSE；后端 run 自然结束。被丢弃 runtime 的迟到 identity、事件和 finally 都必须被对象身份校验拦截，不能恢复已关闭的 Tab 或污染随后创建的分支。

## 边界与非目标
- 传输层不解释业务事件含义，只负责帧、连接、错误和生命周期。
- SSE 是兼容路径，默认产品链路优先验证 WebSocket。
- 代理层必须关闭缓冲，否则前端无法保证实时显示。

## 相关文件
- `../src/features/transport/lib/queryStreamRuntime.sse.ts`
- `../src/features/transport/lib/queryStreamRuntime.ws.ts`
- `../src/features/transport/lib/queryStreamExecutors.ts`
- `../src/features/transport/lib/wsClient.ts`
- `../src/features/transport/lib/transportMode.ts`
- `../src/features/btw/components/BtwProvider.tsx`
- `../src/shared/data/api/client.ts`
- `../src/features/conversation/hooks/useConversationWsRuntime.ts`
- `../src/features/conversation/hooks/useConversationSseAttachRuntime.ts`
- `../src/features/composer/hooks/useMessageActions.ts`
