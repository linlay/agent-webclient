# 流式传输 SSE 与 WebSocket

## 当前状态

WebClient 业务层只依赖 `RealtimeTransport`，门面固定提供 `runs`、`push`、`inbound`、`terminal` 四项窄能力。Standalone adapter 复用唯一 `wsClientSingleton`；agents、chats、project、resource、registry 等普通 Data API 始终走现有 HTTP client，不再由 routed client 暗中创建 WebSocket request。

主 Run query、BTW、attach 和控制由 `RunTransport` 统一承接。Voice query 进入同一 Run 门面，浏览器 ASR/TTS 的 Voice WebSocket 保持独立。旧 `QueryStreamExecutor`、transport client 和 terminal primitive 兼容入口已移除。

## 领域接口

- `RunTransport`：`startQuery`、`startBtw`、`subscribe`、`interrupt`、awaiting/tool submit、`steer`、access level。
- `PushTransport`：支持多消费者以及 type/chat/run/agent 过滤；取消订阅立即通过统一 detach 停止该消费者。
- `InboundRequestTransport`：仅根网站注册 `webclient.sidebar.*` 反向 action。
- `TerminalTransport`：`open`、status subscription、write、resize、detach、close。

`RunExecution` 同步返回 `identity`、`completion` 和幂等 `detach`；`TerminalExecution` 保留自己的 `accepted`。query 的 identity 只从关联 stream 中首个 canonical `chatId/runId/owner` 事件取得，identity 前事件进入有界缓冲并在身份稳定后按原序投影。Terminal 的 `detach` 只停止当前 Surface 观察，`close` 才结束终端；即使先 detach，后续显式 close 仍会发送关闭操作。

## Standalone 生命周期

`RealtimeTransportProvider` 每个 guest 生命周期只创建一个 `StandaloneRealtimeTransport`。Provider mount 本身不会打开 Run 或 Terminal stream；首个 push、inbound、Run 或 Terminal 消费者按需初始化 singleton。普通 Data API 不参与该生命周期。

会话通知与 Run 观察分别由 `useChatNotificationRuntime` 和 `useRunSubscriptionRuntime` 编排。Run 恢复固定遵循 replay、推导 owner/run/lastSeq、stale check、subscribe；只读 Surface 使用 epoch、chatId、runId 和 seq 丢弃旧 binding 事件，检测 gap 后最多重新 replay 一次。销毁 Surface 只 detach，不 interrupt/close Run。

Run push 的聊天摘要、未读、awaiting 与 active-run 更新仍由 conversation 层解释；transport 只负责连接和帧。管理页 catalog push 同样通过 `PushTransport` 消费，不直接订阅 singleton。

## 时间与 owner 约束

事件必须带安全整数 epoch-ms `timestamp`。缺失、字符串、秒级、浮点或 `0` 时间按 `time_contract_violation` 拒绝，不使用本机时间伪造时间线状态。Agent owner 使用 `agentKey`，编排 Team owner 只使用 `teamId`；成员事件不得覆盖 Team Run owner。

## WebClient 反向 Request

第一阶段 Action Registry 仍为：

- `webclient.sidebar.getState`
- `webclient.sidebar.setState`
- `webclient.sidebar.openUrl`
- `webclient.sidebar.refreshUrl`

这些 handler 只在 `/` 通过 `InboundRequestTransport` 显式注册。Agent、Copilot 和独立 Surface 不注册全局 sidebar action；Web URL 只接受绝对 HTTP(S)，拒绝协议相对 URL、凭据 URL 和其他 scheme。

## Desktop adapter

`DESKTOP_APP` 只接受布尔 `true` 或精确字符串 `"true"`。Desktop 模式读取固定只读全局 `__AGENT_WEBCLIENT_PLATFORM_WS__` 与 WorkPanel bridge；Frame Port 缺失或 transport version 不兼容时显示稳定阻断页，任何错误都不回退 Standalone。Desktop socket factory 不构造网络 URL、不读取 access token，也不创建 Agent Platform `/ws`。

Standalone 原生 `WebSocket` 与 Desktop `createSocket()` 共用同一个 `WsClient` JSON parser、request map、stream map、push 分发与 `ApiError` 转换。两种模式的 query、attach、detach、interrupt、submit、steer 和 access-level 都生成 Platform request frame；Platform stream 一帧投影一个 event，不存在 Desktop batch adapter。

新 Chat query 不预造 chatId/runId，继续 Chat 只携带 chatId。页面仅在相关 stream identity 就绪后把 `?newChat=` replace 为稳定 `?chatId=`；`chat.created` push 不参与 query 归属判断。Desktop Chat guest inactive 时幂等 detach，identity 未就绪则等 bootstrap 后 detach；恢复 active 时等待 detach 完成，并以当前 `lastSeq` attach。BTW 与 Terminal 在 Desktop 仍明确 unsupported。

## 相关文件

- `../src/features/transport/contracts/realtimeTransport.ts`
- `../src/features/transport/components/RealtimeTransportProvider.tsx`
- `../src/features/transport/lib/standaloneRealtimeTransport.ts`
- `../src/features/transport/lib/platformRunTransport.ts`
- `../src/features/transport/lib/platformPushTransport.ts`
- `../src/features/transport/lib/standaloneInboundRequestTransport.ts`
- `../src/features/transport/lib/standaloneTerminalTransport.ts`
- `../src/features/transport/lib/desktopRealtimeTransport.ts`
- `../src/features/conversation/hooks/useChatNotificationRuntime.ts`
- `../src/features/conversation/hooks/useRunSubscriptionRuntime.ts`
- `../src/features/surfaces/useReadonlyRunSurfaceRuntime.ts`
