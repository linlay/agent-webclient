# 流式传输SSE与WebSocket

## 当前状态
对话流支持 SSE 与 WebSocket 两种模式。SSE 运行时在 `queryStreamRuntime.sse.ts`，WebSocket 运行时在 `queryStreamRuntime.ws.ts`，模式读取和持久化由 `transportMode.ts` 负责。attach、detach 和 replay 逻辑位于 transport 模块与 chat session 模块交界处。

## 核心职责
- 发起 `/api/query` 流式请求并逐事件回调。
- 支持 `/api/attach` 续接已有 run。
- 管理 abort、detach、重试、WebSocket 连接状态和错误展示。
- 将传输细节隐藏在 `QueryStreamExecutor` / `AttachStreamExecutor` 后面。

## 核心流程
Composer 发送消息时解析当前 transport mode，调用对应 executor。运行时收到事件后传给 `useAgentEventHandler`，terminal event 会停止 streaming 并清理 abort controller。切换 chat 时，若原会话仍在流式输出，会按当前模式 detach 或 abort 并保存快照。

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
- `../src/features/composer/hooks/useMessageActions.ts`

