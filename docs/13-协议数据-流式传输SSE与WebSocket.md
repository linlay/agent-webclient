# 流式传输SSE与WebSocket

## 当前状态
对话流支持 SSE 与 WebSocket 两种模式。SSE 运行时在 `queryStreamRuntime.sse.ts`，WebSocket 运行时在 `queryStreamRuntime.ws.ts`，模式读取和持久化由 `transportMode.ts` 负责。连接与帧处理归 transport，attach/detach 和对话观察编排归 conversation 与 runs。直连 Platform 时，即使 query 选择 SSE，页面也保持一条普通 `/ws` 控制连接，用于接收 Platform 发起的 WebClient 反向 request；Gateway backend 第一阶段不启用该能力。

## 核心职责
- 发起 `/api/query` 流式请求并逐事件回调。
- 支持 `/api/attach` 续接已有 run。
- 管理 abort、detach、重试、WebSocket 连接状态和错误展示。
- 将传输细节隐藏在 `QueryStreamExecutor` / `AttachStreamExecutor` 后面。

## 核心流程
Composer 发送消息时解析当前 transport mode，调用对应 executor。所有事件源共享同一个 `useConversationEventHandler` 实例；terminal event 会停止 streaming 并清理 abort controller。切换 chat 时，若原对话仍在流式输出，会按当前模式 detach 或 abort 并保存快照。新建对话收到稳定 `chatId` 的 URL promotion 仍由原 `/api/query` 消费到终态；SSE 与 WebSocket attach 入口会先检查同一 `chatId`、`runId`、owner 是否已由 live query session 观察，若是则记录本地诊断并拒绝第二个 observer。页面刷新或没有 live query session 的运行中稳定 chat 仍允许恰好一次正常 attach。

`buildQueryPayload` 是 SSE 与 WebSocket query 的统一序列化入口。Composer 选择的强制技能经 trim、去空和大小写不敏感去重后只写入 `mustUseSkills`；无选择时省略字段，已删除的 `requiredSkillKeys` 不得出现在任一传输 payload。

Platform 重启后，可恢复的 question/planning 会在 `/api/chat` 同时返回权威 `awaiting` 与 `activeRun(state:"WAITING_SUBMIT")`。对话加载先 replay 并校准 awaiting，再立即使用 `activeRun.lastSeq` attach；空闲 observer 在用户尚未回答时保持连接。submit 成功只清理 awaiting UI，不再发起第二次 attach，原连接从 `request.submit`、`awaiting.answer` 继续消费同一 run 的 reasoning/content/tool/terminal 事件。WebSocket 发生真正重连时，如果当前 chat 仍有 awaiting、active run 或正在观察的 run，前端先重新加载 `/api/chat`，再由新的 activeRun 游标恢复 attach，而不是等待用户点击提交。

WebSocket push 中的 `chat.created`、`chat.renamed`、`chat.updated` 直接更新会话摘要；`chat.renamed` 即使在当前 query streaming 期间到达也必须立即应用，不得被流式事件的当前会话过滤丢弃。

SSE / WebSocket event 必须带安全整数 epoch-ms `timestamp`。客户端遇到缺失、字符串、秒级、浮点或 `0` 的时间会按 `time_contract_violation` 拒绝该 event，不以本机当前时间生成时间线节点或任务状态。

`/api/btw` 复用 SSE 帧解析和错误映射，但始终走 HTTP SSE，不受主对话 WebSocket 模式影响。BTW 事件进入 feature-owned projection，不进入主对话事件处理器。新发起的 live BTW run 只消费这条 `/api/btw` 流，不并发调用 `/api/attach`；只有 Provider 初始化时从 `sessionStorage` 恢复出的 running run 才会 attach，且每个恢复 run 只 attach 一次。

BTW 的运行控制也与主对话传输模式隔离。BTW Stop 固定以 HTTP `POST /api/interrupt` 发送 `runId` 与其恢复出的 owner：Agent 为 `agentKey`，编排 Team 为仅 `teamId`；即使主对话选择 WebSocket 也不会改走 WS。前端校验响应中的 `accepted`、`status`、`runId` 和 `detail`：仅 `accepted: true` 时才 abort 当前 BTW SSE 并转为空闲；后端拒绝或网络失败时继续消费原 SSE、保持 running 并允许重试。中断响应绑定发起请求时的 runtime、runId 和 AbortController，迟到响应不能停止关闭后重建的新分支。

attach/detach 也使用同一 owner 规则。SSE 和 WebSocket 不会把 Team 成员事件携带的 `agentKey` 写回 session/chat owner；成员事件仍可按 `taskId`、`subAgentKey` 和 `presentation: "task"` 渲染为子任务，主回答归属保持 Team。

关闭 Side question 只销毁该 chat 的前端 session、runtime 与持久化记录，不发送 interrupt，也不 abort 正在消费的 SSE；后端 run 自然结束。被丢弃 runtime 的迟到 identity、事件和 finally 都必须被对象身份校验拦截，不能恢复已关闭的 Tab 或污染随后创建的分支。

## WebClient 反向 Request

WebClient 控制连接使用 `/ws?source=WebClient&deviceId=<device-id>&surfaceId=<surface-id>`。`deviceId` 沿用 localStorage 标识，`surfaceId` 是当前页面生命周期内的随机标识并写入 sessionStorage；页面内路由切换和 WebSocket 重连不会更换它，刷新页面或打开新标签页会生成新值。SSE `/api/query` 同时发送 `X-Agent-WebClient-Device-Id` 与 `X-Agent-WebClient-Surface-Id`；device header 与控制连接使用同一标识，认证 JWT 已含 device claim 时由 Platform 优先使用 claim。两者共同使 Platform 将 run 绑定到这个逻辑标签页。

`WsClient.registerInboundRequestHandler(type, handler)` 只允许按完整 `type` 精确登记 handler。收到 `frame:"request"` 后直接把 `payload` 交给 handler；成功返回同 `id`、同 `type` 的 response，业务错误返回 error。未知 type、非法帧参数和同连接重复 id 分别返回 `unknown_request_type`、`invalid_request`、`duplicate_id`。连接关闭后，旧连接上的未完成 handler 不会再发送结果。

第一阶段 Action Registry 只有：

- `webclient.sidebar.getState`
- `webclient.sidebar.setState`
- `webclient.sidebar.openUrl`
- `webclient.sidebar.refreshUrl`

Action Registry 不接受 Redux action、DOM selector、JavaScript 函数名、CustomEvent、任意路由或组件名。sidebar set 必须显式给出 `open`，左侧栏不接受 `tab`，关闭右侧栏时也不接受 `tab`；右侧第一阶段只接受 `overview`、`btw`、`debug`。`webclient.sidebar.openUrl` 使用 `{url, title?}` 创建或激活 Web Preview 并打开右侧 `web` tab：裸域名按 HTTPS 规范化，只接受 HTTP(S)，拒绝协议相对 URL 和带凭据 URL；它不经过 Desktop bridge。handler dispatch 后从同步 `stateRef` 读取最终状态，并以 `applied:false` 表示幂等请求。`webclient.sidebar.refreshUrl` 使用精确 `{url}` 刷新已存在的规范化 Preview，不创建资源、不打开右侧栏、不切换 tab 或活动 URL；目标未打开或当前路由不支持右侧栏时返回 `unsupported_in_current_view`（409）。Preview 状态成功不代表目标站点允许 iframe 嵌入或刷新加载成功，CSP 或 `X-Frame-Options` 拒绝仍由现有预览错误状态呈现。

## 边界与非目标
- 传输层不解释业务事件含义，只负责帧、连接、错误和生命周期。
- SSE 是兼容路径，默认产品链路优先验证 WebSocket。
- 代理层必须关闭缓冲，否则前端无法保证实时显示。

## 相关文件
- `../src/features/transport/lib/queryStreamRuntime.sse.ts`
- `../src/features/transport/lib/queryStreamRuntime.ws.ts`
- `../src/features/transport/lib/queryStreamExecutors.ts`
- `../src/features/transport/lib/wsClient.ts`
- `../src/features/transport/lib/wsClientSingleton.ts`
- `../src/shared/data/clientDeviceId.ts`
- `../src/shared/data/clientSurfaceId.ts`
- `../src/features/transport/lib/transportMode.ts`
- `../src/features/btw/components/BtwProvider.tsx`
- `../src/shared/data/api/client.ts`
- `../src/features/conversation/hooks/useConversationWsRuntime.ts`
- `../src/features/conversation/hooks/useWebClientActionRuntime.ts`
- `../src/features/conversation/hooks/useConversationSseAttachRuntime.ts`
- `../src/features/composer/hooks/useMessageActions.ts`
