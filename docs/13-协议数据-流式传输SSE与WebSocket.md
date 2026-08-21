# 流式传输 SSE 与 WebSocket

## 当前状态

WebClient 业务层只依赖 `RealtimeTransport`，门面固定提供 `runs`、`push`、`inbound`、`terminal` 四项窄能力。Standalone adapter 与数据请求 transport 复用唯一 `wsClientSingleton`；agents、agent、chats、chat、archive 等普通 Data API 按 endpoint 的 `wsBackends` 能力表选择主 WebSocket 或 HTTP。Platform 与 Gateway 已暴露的 WS route 严格走 request/response frame，连接失败、断开和超时都不回退 HTTP。

主 Run query、BTW、attach 和控制由 `RunTransport` 统一承接。Voice query 进入同一 Run 门面，浏览器 ASR/TTS 的 Voice WebSocket 保持独立。Admin/Registries、Automation、Project、上传下载、resource Blob 与语音 HTTP 保留专用 HTTP 路径；旧 `QueryStreamExecutor` 和 terminal primitive 兼容入口已移除。

## 领域接口

- `RunTransport`：`startQuery`、`startBtw`、`subscribe`、`interrupt`、awaiting/tool submit、`steer`、access level。
- `PushTransport`：支持多消费者以及 type/chat/run/agent 过滤；取消订阅立即通过统一 detach 停止该消费者。
- `InboundRequestTransport`：仅 Standalone 根网站注册 `desktop.action.call` WorkPanel 反向 action。
- `TerminalTransport`：`open`、status subscription、write、resize、detach、close。

`RunExecution` 同步返回 `identity`、`completion` 和幂等 `detach`；`TerminalExecution` 保留自己的 `accepted`。query 的 identity 只从关联 stream 中首个 canonical `chatId/runId/owner` 事件取得，identity 前事件进入有界缓冲并在身份稳定后按原序投影。Terminal 的 `detach` 只停止当前 Surface 观察，`close` 才结束终端；即使先 detach，后续显式 close 仍会发送关闭操作。

## Standalone 生命周期

`RealtimeTransportProvider` 每个 guest 生命周期只创建一个 `StandaloneRealtimeTransport`。Provider mount 本身不会打开 Run 或 Terminal stream；首个 data request、push、inbound、Run 或 Terminal 消费者按需初始化 singleton。Standalone 的 `StandaloneSocketDriver` 创建真实 WebSocket，只有收到并校验 Platform WS v2 `connected` 后才进入 connected；它按握手协商的 heartbeat/silence 参数探活，任意合法业务帧同样刷新入站时间。GET data request 仍应用 endpoint cache 与 dedupe，同一 payload 的并发读取只产生一个 WS request。

`transport: "auto"` 必须声明 `wsBackends`。当前 backend 在能力表中时只发送 Platform request frame；不在能力表时直接使用 HTTP client，这属于请求前的静态路由选择，不是传输故障后的 fallback。Desktop 命中该能力时复用当前 `DesktopFramePortDriver` 登记的 `PlatformFrameClient`；Frame Port client 未初始化时直接报 `DESKTOP_FRAME_PORT_CLOSED`，绝不创建 guest 直连。

会话通知与 Run 观察分别由 `useChatNotificationRuntime` 和 `useRunSubscriptionRuntime` 编排。Run 恢复固定遵循 replay、推导 owner/run/lastSeq、stale check、subscribe；只读 Surface 使用 epoch、chatId、runId 和 seq 丢弃旧 binding 事件，并从 `RealtimeTransportError.code`、`ApiError.code` 或 `platformError.code` 识别 `seq_expired`/`replay_required`。每个 Chat、Run 和 Surface 激活周期最多自动重新 replay 一次，第二次失败保留稳定错误与手动重试入口；销毁 Surface 只 detach，不 interrupt/close Run。

Run push 的聊天摘要、未读、awaiting 与 active-run 更新仍由 conversation 层解释；transport 只负责连接和帧。管理页 catalog push 同样通过 `PushTransport` 消费，不直接订阅 singleton。

## 时间与 owner 约束

事件必须带安全整数 epoch-ms `timestamp`。缺失、字符串、秒级、浮点或 `0` 时间按 `time_contract_violation` 拒绝，不使用本机时间伪造时间线状态。Agent owner 使用 `agentKey`，编排 Team owner 只使用 `teamId`；成员事件不得覆盖 Team Run owner。

## Standalone WorkPanel 反向 Request

Standalone 根路由注册一个 `desktop.action.call` handler，只接受七个 `desktop.workpanel.*`：`getState/openTab/openWeb/refreshWeb/activateTab/closeTab/closeWorkpanel`。它把 WorkPanel 语义投影到现有右侧栏与 Web Preview；内置项 ID 固定为 `sidebar:overview|btw|debug`，网页项 ID 为 `web:<规范化 URL 的 base64url>`。`refreshWeb` 同时激活目标；`closeWorkpanel` 只隐藏右侧栏并保留 Web Preview。`source.chatId` 必须等于当前页面 Chat；native、其他 WebClient module、固定或不可关闭网页 descriptor 返回 `unsupported_in_current_view`。Desktop adapter 不暴露 `inbound`，因此不会注册该 handler。

## Desktop adapter

`DESKTOP_APP` 只接受布尔 `true` 或精确字符串 `"true"`。Desktop 模式读取固定只读全局 `__AGENT_WEBCLIENT_PLATFORM_FRAME_PORT__` 与 WorkPanel bridge；Frame Port 缺失或 transport version 不兼容时显示稳定阻断页，任何错误都不回退 Standalone。`DesktopFramePortDriver` 只消费结构化 frame/state/close 事件，不构造网络 URL、不读取 access token、不创建心跳 timer、不自行重连，也不创建 Agent Platform `/ws`。

`PlatformFrameClient` 是网络无关的唯一帧状态机，统一拥有 request 关联、stream 生命周期、业务 push、`ApiError` 与时间字段转换。`StandaloneSocketDriver` 只增加真实 WebSocket、鉴权、v2 握手、协商存活和网络重连；`DesktopFramePortDriver` 只增加宿主 Session 与连接状态投影。两种模式的普通 data request 以及 query、attach、detach、interrupt、submit、steer 和 access-level 都生成结构化 Platform request frame；控制帧不进入业务 Push，Platform stream 一帧投影一个 event，不存在 Desktop batch adapter。

Desktop 收到 `reconnecting` 时保留已接受 stream 和原订阅者，不 reject Promise。物理恢复和 `attach(lastSeq)` 由 Desktop Broker 完成，恢复帧继续进入原 stream。重连期间新的一次性请求以可重试 `PLATFORM_CONNECTION_UNAVAILABLE` 失败；只有 Frame Port 永久 close 才以 `DESKTOP_FRAME_PORT_CLOSED` 终止全部待处理操作。`WS_DISCONNECTED` 仅属于 Standalone 真实 WebSocket。

新 Chat query 不预造 chatId/runId，继续 Chat 只携带 chatId。页面仅在相关 stream identity 就绪后把 `?newChat=` replace 为稳定 `?chatId=`；`chat.created` push 不参与 query 归属判断。Desktop 宿主通过独立 surface lifecycle 信号同步 Main Chat 页面离开、Copilot 关闭和 Kanban Chat 页面退出；guest inactive 且存在 stream 时永久释放本次 observer 并幂等 detach，identity 未就绪则等 bootstrap 后 detach。进入页面不复用旧 execution，而是先强制读取 `/api/chat` replay，以服务端 `activeRun` 判断是否仍需观察，仅在 active 时从服务端 `lastSeq` 新建 attach。左侧 Nav 只切换页面并展示 push 投影的状态，不读取 `activeRun`，也不生成 query/attach/detach。独立 Overview/Debug 在 Desktop WorkPanel 中保持 replay-only；独立 BTW 可使用 `startBtw`，Terminal 仍明确 unsupported。

## 相关文件

- `../src/features/transport/contracts/realtimeTransport.ts`
- `../src/features/transport/components/RealtimeTransportProvider.tsx`
- `../src/features/transport/lib/standaloneRealtimeTransport.ts`
- `../src/features/transport/lib/platformDataRequestTransport.ts`
- `../src/features/transport/lib/platformRunTransport.ts`
- `../src/features/transport/lib/platformPushTransport.ts`
- `../src/features/transport/lib/standaloneInboundRequestTransport.ts`
- `../src/features/transport/lib/standaloneTerminalTransport.ts`
- `../src/features/transport/lib/desktopRealtimeTransport.ts`
- `../src/features/transport/lib/platformFrameClient.ts`
- `../src/features/transport/lib/desktopFramePortDriver.ts`
- `../src/features/transport/lib/desktopPlatformFrameClientRegistry.ts`
- `../src/features/transport/lib/wsClient.ts`
- `../src/features/conversation/hooks/useChatNotificationRuntime.ts`
- `../src/features/conversation/hooks/useRunSubscriptionRuntime.ts`
- `../src/features/surfaces/useChatSurfaceReplay.ts`
