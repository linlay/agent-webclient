# Desktop宿主桥接

## 当前状态
WebClient 已消费 v6 canonical generated Desktop contract，通过固定只读全局 `__AGENT_WEBCLIENT_PLATFORM_FRAME_PORT__` 与 `__AGENT_WEBCLIENT_WORKPANEL_BRIDGE__` 接入 Main Broker 和 WorkPanel。Frame Port transport version 固定为 2；现有 Desktop context、截图、文件系统和右键桥接继续服务各自能力，但不作为 realtime fallback。

## 核心职责
- 严格判断 `DESKTOP_APP`：只接受布尔 `true` 或精确字符串 `"true"`。
- 向宿主发送 route、workspace、screenshot、file system 等请求或通知。
- 缺少 canonical Platform Frame Port 时阻断所有 guest 业务 Surface，避免 guest 直连 Platform。
- 将 Run 与 Push 交给共享 Platform transport；WebClient 不维护 WorkPanel workspace/tab state。
- 将 Desktop 截图结果转换为 Composer 可上传文件。
- 在 query payload 中补充宿主提供的上下文。

## 核心流程
Provider 仅在 Desktop Frame Port 结构和 transport version 有效时渲染页面。surface/capability denial 作为相同 request id 的标准 Platform error 留在具体操作中。`DesktopFramePortDriver` 把 Session 的结构化 frame/state/close 交给共享 `PlatformFrameClient`，不依赖 `WsClient`、socket factory 或字符串消息；WorkPanel 保持独立 `getCapabilities()` 宿主查询和逐请求授权。Workspace File、Artifact 和 Reference 统一使用语义化 `openDocument`，成功结果只包含 WorkPanel item 身份与 `native-html | native-image` renderer，不接收 handle、绝对路径、revision 或内部 descriptor。

`openDocument` 使用 `workspace-file | artifact | reference` 来源联合。WebClient 对 descriptor 做结构和编码检查，宿主以真实 sender 的 owner Chat 与权威存储重新校验。只有稳定错误 `unsupported_native_type` 允许 WebClient 打开自己的 Document Surface；`capability_denied`、`target_unavailable`、`invalid_request` 等都停留在原错误。旧 bridge 方法只用于历史 bundle 兼容，Standalone 不进入 Desktop 分支。

Resource Viewer 内的 Office/未知文档本地操作走独立的 Service WebView 消息：请求包含 `requestId`、`reveal | open-default`、`chatId`、profile 和受限相对路径，不携带本地绝对路径。Desktop Main Chat Surface 以当前 owner Chat 校验请求，WorkPanel Surface 还要求请求与当前可信 Artifact/Reference descriptor 完全一致，再通过类型化 preload/IPC 调用 Main；响应只返回 `ok`、稳定错误码和安全提示。该能力不修改 Agent WebClient Bridge 版本，也不新增 Agent Platform HTTP 接口。

Bridge 全局可见早于 Desktop surface 完成登记属于允许的启动窗口，由 Desktop 在 Frame Port open 层限时收敛；WebClient 不通过 `/api/agents` 预热或业务请求重试规避该窗口。逻辑 Session 生命周期与宿主物理 WebSocket generation 分离；`connecting/connected/reconnecting/closed` 由宿主权威投影，WebClient 不从 guest token 或本地 timer 推断。永久 close 的稳定 reason/error 保留到 UI 与诊断，且不得触发 HTTP fallback。

Frame Port 只承载 Platform `request/response/stream/push/error`。新 query 绝不发送预造 `runId`；关联 stream bootstrap identity 解析后释放 identity 前事件。Main Chat、Copilot Chat、Kanban Chat 至多一个 active；Page Visibility 驱动 inactive detach 和 active `lastSeq` attach。Desktop WorkPanel 为 Overview、Debug、BTW、Source、Planning、Artifact、Reference、File、Project、Skill 分别使用判别式 context 和 canonical 路由，不共享全可选 context。Desktop 只依据宿主持有的结构化 surface role 映射 Frame Port 身份，不从 route、查询参数或文件路径推断；File、File Diff、Source、Artifact、Reference、Planning、Skill 等 management surface 可发送各自所需的普通 request/response，但不获得 query、attach 或 BTW live Run lease。File descriptor 保留用户请求的相对或绝对路径，不依赖 `currentWorker.workspaceDir` 做打开前判权；File Diff 的 `/workspace/...` 事件路径可在独立 Overview 中安全归一化为项目相对路径。Artifact/Reference 保留各自 module/context，但共用 Resource route。Skill descriptor 只携带非空 `key`，不继承 Chat、Agent、路径或凭据上下文。Bridge 只负责先打开面板，随后由面板请求 Platform。激活且归属于 Main Chat 的 Overview/Debug 可以发送普通 attach 帧，但 Desktop 只把它注册为 Main Chat 当前 visible Run 的本地只读 consumer，并在本地拦截 detach，不产生第二个上游 observer。本地 replay 游标过期时，Frame Port 保留 `seq_expired`、可重试标记和不含敏感数据的游标窗口诊断；WebClient 重新读取 `/api/chat` 后使用新快照游标订阅。激活的 Main Chat、BTW 子 Surface 与固定 `selection-explain` 辅助 Surface 可以发送各自授权的 `/api/btw`/BTW attach；BTW 子 Surface和解释 Surface都不能发送 `/api/query`，解释 Surface也不获得全局 Push 或 WorkPanel capability。其他独立 Surface 只做 chat replay 或文件读取。

Main Chat 的 active 恢复只能在 URL 中 canonical `chatId` 与当前已投影状态的 `chatId` 相同时执行。Chat 路由切换期间两者不同，WebClient 不得使用旧状态 `forceReload` 恢复旧 Chat；应只保留新路由触发的正常 `/api/chat` 加载。

Desktop route bridge 是 Main Chat SPA 导航的权威命令，协议只保留 `READY + APPLIED`。`BaseShell` 中不会随 Chat 子路由卸载的 Router subscriber 完成注册后，通过 page-to-preload 事件 `__desktopServiceWebviewRouteStatus` 发送 `desktopRouteReady(routerLocation)`；React StrictMode 重挂可重复发送，Desktop 幂等处理。Desktop 收到 READY 后才通过现有命令通道发送最新 `desktopRouteChanged(routeRevision, pathname, search, hash)`，Main Chat 命令必须携带正整数 revision，不接受无 revision 兼容导航。浏览器物理 `window.location` 可能已被宿主更新，而 React Router 仍持有旧 `agentKey/chatId/newChat`，因此物理 URL 只能用于宿主观测，不能用于 WebClient bridge 去重。WebClient 仅以 `useLocation()` 判断目标；不匹配时覆盖最新 pending 并调用 `navigate(target, { replace: true, flushSync: true })`，使目标 Router、历史骨架与页面 DOM 在一次同步提交内进入首帧。Router 已精确匹配时立即发送 APPLIED，否则在 location 提交后的 layout effect 中发送 `desktopRouteApplied(routeRevision, routerLocation)`；IPC 收到和 `navigate()` 返回都不代表完成。A→B→C 中 C 覆盖 B pending，B 的迟到 render 不能确认 C。DevTools 诊断固定为 `[desktop-route] router-ready/bridge-received/router-navigate/router-applied`，记录 revision、Router target 与 physical location。Desktop 缺失 READY 或 APPLIED 时可执行一次异常 reload，但 WebClient 不增加 received ACK、定时重发、HTTP、WebSocket、MessagePort 或 Snapshot 协议。

Desktop Main Chat 的普通 `←/→` 工作区快捷键由 WebClient 先做 DOM 语义判定，再以 `desktop:agent-webclient:workspace-arrow-key` 受限消息通知宿主；只在 Agent Chat Shell 安装，不适用于管理页、WorkPanel 或 Standalone。目标位于输入、可编辑内容、按钮、链接、菜单、可聚焦选项、代码/终端，或页面存在 active awaiting/HITL、模态层、非折叠文字选区、修饰键、repeat、IME composition、pointer/drag gesture 时必须放行。active awaiting 采用整页门禁，因为既有 HITL 方向键处理器挂在 window，不能只检查 event target。只有宿主确认消息来自 active、身份已提交且 generation 匹配的 Main Chat surface 后，才把左键解释为左侧栏切换、右键解释为当前 canonical Chat WorkPanel 切换；WebClient 不读取或缓存两侧栏状态。

Main Chat 从已有 Chat 发起“新对话重问”时，WebClient 通过一次性 `desktop:agent-webclient:new-chat:prepare` 请求提交 `requestId + agentKey + sourceChatId + newChat`。只有匹配的 `desktop:agent-webclient:new-chat:prepared` 成功响应才允许重置和发送。响应表示 Desktop 已把外层 route 与 guest URL 切换到同一 `newChat`，并以无 `ownerChatId` 的 active Main Chat Surface 完成登记；它不表示 query 或 Chat 已创建。失败、超时、来源变化或重复事务不得降级为直接发送。

Desktop 原生 Market 的创建技能入口复用普通新 Chat 路由，并通过一次性 URL 参数传入本地化 `composerDraft` 与 `composerSkill=skill-creator`。参数名声明能力类型，参数值声明具体选择；WebClient 校验后填入草稿并选中对应 Skill，随后立即从 URL 删除。非法 Skill key、缺少任一参数、已有 `chatId` 或无有效 `newChat` 时忽略。宿主不能借这些参数自动提交消息或绕过 Composer 确认。

Desktop 原生 History dialog 不加载 WebClient、不登记 guest surface，也不使用 WebClient 宿主消息。`/history` 只保留 Standalone 基础筛选和页面 Router 导航；Desktop 通过自身受限 Assistant bridge 读取和操作 Chat，因此 WebClient surface 不能借 History 入口取得外层导航权或 live Run lease。

Frame Port 是完全不兼容升级。缺失 port、错误 transport version 或旧 Program manifest 都必须稳定阻断，不安装旧 adapter、不回退 Standalone，也不重新提交 query。vendored contract hash、WebClient bundle 与 Desktop 内置资源必须同批生成、发布和回滚；Desktop 按钮与 WebClient 顶栏入口归属变更也必须原子交付，不能发布重复入口或无入口的混合版本。

物理断线只产生 `reconnecting`，不会 close 逻辑 Session 或终止已接受 stream；Desktop Broker 恢复后从 `lastSeq` 继续向同一订阅者投递。`surface_inactive` 只解除观察者，不 interrupt 后台 Run。协议不兼容、身份失效、应用退出或显式 dispose 才永久关闭，所有未完成操作统一收到 `DESKTOP_FRAME_PORT_CLOSED`。Desktop Driver 不实现 WebSocket readyState、close code/reason、JSON 二次编码、heartbeat timeout 或重连循环。

## 边界与非目标
- APPLIED 仅表示 Router 提交，不代表历史数据 ready。页面拒绝更旧 revision 或同 revision 的冲突目标；会话阶段日志以对应目标的 route revision 与 transaction seq 关联。surface 激活恢复只消费 Router 提供的目标，不使用物理 URL 推断应恢复哪个 Chat。准备超时由 WebClient 展示错误，不触发 Desktop 再次 reload。
- Standalone 浏览器独立运行；Desktop 标记一旦启用就不得降级为 Standalone。
- Standalone 根路由与 Desktop WorkPanel 都只使用正式 `desktop.workpanel.*` 语义，不维护平行 sidebar Action 映射。
- Standalone 根路由分别注册七个精确 `desktop.workpanel.*` 与 `desktop.display` request type，直接消费纯 payload，并校验帧顶层可信 `source.chatId/runId/owner`；Desktop 模式不注册该 provider，因为 Platform 的 `desktop.*` 反向请求由 Desktop Main Broker 处理。
- Agent WebClient guest 不读取、缓存或接收 access token；Desktop host 对 manifest 声明过鉴权的显式 HTTP `/api` 请求在 Main 内注入并在一次 401 后刷新。
- Agents、Agent、Chats、Archives、Memory 等 capability 标记为 Platform WS 的数据请求复用 Frame Port；Automations、Admin/Registries、Project、上传下载和资源 Blob 保持普通 HTTP。Desktop 不再传递 `wsSource`。
- Program manifest 只保留显式 HTTP `/api` 与独立可选 `/api/voice`；主 Platform request/response/stream/push 统一走 Main Broker Frame Port，guest 不声明 `/auth`、主 `/ws` 或 query/attach SSE。
- Desktop 负责把 WebView 容器铺满主内容区，WebClient 的独立管理路由负责用页面布局填满 guest viewport；宿主不得注入 CSS 修补 guest 页面高度。
- Desktop 的 Main Chat WorkPanel 按钮、presentation visibility 和 hide/show 语义属于宿主；WebClient 不维护 workspace/tab/visible 状态，也不借 Copilot Dock 代替该入口。Agent Chat 顶栏保留由 Debug 功能开关控制的调试按钮，通过既有 openTarget/WorkPanel bridge 打开当前 Chat 的 Debug item；它不承担整个 WorkPanel 的显隐控制。Settings Menu 与 Quick Actions 在 Desktop 模式下始终隐藏。
- Program Bundle 的静态托管由 Desktop main process 负责，不在前端启动服务。
- File、Artifact 与 Reference 的 Workspace、ChatScope、canonical path、symlink 和越界访问权限以 Platform 为唯一权威；WebClient 与 Desktop 仅做 descriptor/URL 结构校验，不复制权限规则。
- `identity-center` 是 Desktop 侧的 token 签发基础，不作为 webclient 与 Desktop 的 postMessage 协议名称。

## Desktop 原生右键语义 v1

WebClient 使用 `WeakMap<Element, Descriptor>` 登记消息、代码、Web 链接、Workspace 文件和 Chat 资源目标，不向 DOM 属性写入正文、代码、路径、Token 或鉴权 URL。Desktop 通过既有 service action channel 下发 `contextMenu.resolve`；页面以 `document.elementFromPoint(x, y)` 从最近元素向上解析，因此代码、链接和附件会优先于所属消息。响应只包含 v1、requestId、短 targetId、目标类型、安全展示元数据和固定 capability。

`contextMenu.execute` 会按坐标重新解析并同时核对 targetId、目标类型和 capability，再调用左键共用的复制、Web Preview、Workspace Preview 或资源下载处理器。虚拟列表回收、流式更新或 DOM 位移使目标变化时无操作。该桥只通过 `electronAPI.onFromMain` 安装动作监听，不安装 DOM `contextmenu` 监听，也不调用 `preventDefault()`；普通浏览器继续使用浏览器原生菜单。

WorkPanel 外层 Artifact/Reference tab 的下载不依赖坐标解析。Desktop 只可发送共享契约声明的 v1 `workPanel.resource.downloadCurrent`；统一 Resource Viewer 在挂载期间注册唯一的当前目标处理器，并调用 Content Viewer 既有鉴权下载执行器。动作不包含资源身份，未挂载 Resource Viewer、版本错误或处理器已卸载时无操作，Desktop 不解析 `/resource-viewer` route 来复制 Platform 权限逻辑。

WorkPanel 评审批注复用同一 service action channel，但使用独立版本化 preview-review action 与 page event。Resource Viewer 在当前可访问的图片或 HTML 目标上声明 capability；批注权威状态始终在 Desktop renderer。图片接收编辑模式和编号矩形的无状态同步，并按请求导出有尺寸/字节上限的临时 PNG。HTML 继续使用不带 `allow-same-origin` 的 sandbox `srcDoc`，由 Viewer 在 CSP 之前插入窄批注脚本；父页面只接受当前 iframe `contentWindow` 且匹配运行期 token 的消息，iframe 只接收父窗口同步的启用状态和有界批注列表。该桥不提供任意 JavaScript/CDP 执行，不回传资源 URL、凭据或表单输入值。

Main Chat Composer 只消费 owner Chat 匹配的 `workPanel.composer.insertDraft`。草稿为空时填入，非空时追加分隔符；可选 PNG 先转为本地 `staged` 附件，不在动作处理时上传，也不自动发送。WebClient 通过共享 preview-review page event 返回一次 ack，Desktop 只有收到成功 ack 才清理运行期 ReviewSession。vendored contract hash、Desktop mirror 与 Program Bundle 必须原子发布，缺少新能力时保持只读。

划词动作使用 bridge v6 的 `selectionToolbar.execute`。Desktop 只提供 request/selection/target ID、动作枚举与首尾坐标；WebClient 按坐标、DOM Selection 和语义 target 三重核对后创建最多 50,000 字符的 `type=selection` reference，正文只存在于 `meta.text` 并沿用 Platform 不可信引用边界。动作结果只允许稳定错误码或 `chatId/runId` handoff，禁止把正文、Prompt、凭据或 URL 回传 Desktop。Standalone 浏览器没有该 host action，页面不自行安装划词工具条。

## 相关文件
- `../src/shared/data/desktop/desktopHostBridge.ts`
- `../src/shared/data/auth/appAuth.ts`
- `../src/shared/data/desktop/desktopScreenshot.ts`
- `../src/shared/data/desktop/desktopFileSystem.ts`
- `../src/shared/data/desktop/desktopQueryContext.ts`
- `../src/shared/hooks/useDesktopRouteChange.ts`
- `../src/shared/hooks/agentPage/useDesktopAction.ts`
- `../src/shared/data/desktop/desktopContextMenu.ts`
- `../src/features/transport/components/RealtimeTransportProvider.tsx`
- `../src/features/transport/contracts/realtimeTransport.ts`
- `../src/shared/contracts/generated/agentWebclientBridge.ts`
- `../src/features/transport/lib/desktopBridge.ts`
- `../src/features/transport/lib/desktopFramePortDriver.ts`
- `../src/features/transport/lib/desktopPlatformFrameClientRegistry.ts`
- `../src/features/transport/lib/platformFrameClient.ts`
- `../src/features/transport/lib/desktopWorkPanelTransport.ts`

## 外观快照 v1

固定只读 `__AGENT_WEBCLIENT_APPEARANCE__` 提供 getSnapshot/subscribe，复用 canonical mirror 的受控解析器；版本与 routeRevision、WorkPanel v6、Frame Port v2 分离。`DESKTOP_APP=true` 只决定背景归属，仍需有效 `background.mode=host` 才启用透明；失效或旧宿主保留明暗实色回退。不分发壁纸、不操作业务导航或 transport。宿主先确认 guest 消费桥，再停止旧 URL 主题更新；最新快照优先于 URL。契约、竞态和双方发布检查见[皮肤与背景协作](82-界面基础-皮肤与背景协作.md)。
