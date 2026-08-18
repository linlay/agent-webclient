# Desktop宿主桥接

## 当前状态
WebClient 已消费 canonical generated Desktop contract，通过固定只读全局 `__AGENT_WEBCLIENT_PLATFORM_WS__` 与 `__AGENT_WEBCLIENT_WORKPANEL_BRIDGE__` 接入 Main Broker 和 WorkPanel。现有 Desktop context、截图、文件系统和右键桥接继续服务各自能力，但不作为 realtime fallback。

## 核心职责
- 严格判断 `DESKTOP_APP`：只接受布尔 `true` 或精确字符串 `"true"`。
- 向宿主发送 route、workspace、screenshot、file system 等请求或通知。
- 缺少 canonical Platform Frame Port 时阻断所有 guest 业务 Surface，避免 guest 直连 Platform。
- 将 Run 与 Push 交给共享 Platform transport；WebClient 不维护 WorkPanel workspace/tab state。
- 将 Desktop 截图结果转换为 Composer 可上传文件。
- 在 query payload 中补充宿主提供的上下文。

## 核心流程
Provider 在 Desktop Frame Port 结构和 transport version 有效时渲染页面。surface/capability denial 作为相同 request id 的标准 Platform error 留在具体操作中。`WsClient` 通过 socket factory 复用 Standalone parser；WorkPanel 保持独立 `getCapabilities()` 宿主查询和逐请求授权，只接收 canonical descriptor，失败时不调用 `window.open` 或旧 Action。

Frame Port 只承载 Platform `request/response/stream/push/error`。新 query 绝不发送预造 `runId`；关联 stream bootstrap identity 解析后释放 identity 前事件。Main Chat、Copilot Chat、Kanban Chat 至多一个 active；Page Visibility 驱动 inactive detach 和 active `lastSeq` attach。Desktop WorkPanel 为 Overview、Debug、BTW、Source、Planning、Artifact、Reference、File、Project 分别使用判别式 context 和 canonical 路由，不共享全可选 context。File descriptor 保留用户请求的相对或绝对路径，不依赖 `currentWorker.workspaceDir` 做打开前判权；Artifact/Reference 保留各自 module/context，但共用 Resource route。Bridge 只负责先打开面板，随后由面板通过 `/api/file` 或 `/api/resource` 请求 Platform。只有激活的 Main Chat 或 BTW 子 Surface 可以发送 `/api/btw`/BTW attach，BTW 子 Surface 不能发送 `/api/query`；其他独立 Surface 只做 chat replay 或文件读取。

Frame Port 是完全不兼容升级。缺失 port、错误 transport version 或旧 Program manifest 都必须稳定阻断，不安装旧 adapter、不回退 Standalone，也不重新提交 query。vendored contract hash、WebClient bundle 与 Desktop 内置资源必须同批生成、发布和回滚；Desktop 按钮与 WebClient 顶栏入口归属变更也必须原子交付，不能发布重复入口或无入口的混合版本。

## 边界与非目标
- Standalone 浏览器独立运行；Desktop 标记一旦启用就不得降级为 Standalone。
- `webclient.*` Action 只在 Standalone 根路由注册；Desktop WorkPanel 使用正式 `desktop.workpanel.*` 语义，不恢复 sidebar Action 映射。
- Agent WebClient guest 不读取、缓存或接收 access token；Desktop host 对 manifest 声明过鉴权的显式 HTTP `/api` 请求在 Main 内注入并在一次 401 后刷新。
- Agents、Agent、Chats、Archives、Memory 等 capability 标记为 Platform WS 的数据请求复用 Frame Port；Automations、Admin/Registries、Project、上传下载和资源 Blob 保持普通 HTTP。Desktop 不再传递 `wsSource`。
- Program manifest 只保留显式 HTTP `/api` 与独立可选 `/api/voice`；主 Platform request/response/stream/push 统一走 Main Broker Frame Port，guest 不声明 `/auth`、主 `/ws` 或 query/attach SSE。
- Desktop 负责把 WebView 容器铺满主内容区，WebClient 的独立管理路由负责用页面布局填满 guest viewport；宿主不得注入 CSS 修补 guest 页面高度。
- Desktop 的 Main Chat WorkPanel 按钮、presentation visibility 和 hide/show 语义属于宿主；WebClient 不维护 workspace/tab/visible 状态，也不借 Copilot Dock 代替该入口。
- Program Bundle 的静态托管由 Desktop main process 负责，不在前端启动服务。
- File、Artifact 与 Reference 的 Workspace、ChatScope、canonical path、symlink 和越界访问权限以 Platform 为唯一权威；WebClient 与 Desktop 仅做 descriptor/URL 结构校验，不复制权限规则。
- `identity-center` 是 Desktop 侧的 token 签发基础，不作为 webclient 与 Desktop 的 postMessage 协议名称。

## Desktop 原生右键语义 v1

WebClient 使用 `WeakMap<Element, Descriptor>` 登记消息、代码、Web 链接、Workspace 文件和 Chat 资源目标，不向 DOM 属性写入正文、代码、路径、Token 或鉴权 URL。Desktop 通过既有 service action channel 下发 `contextMenu.resolve`；页面以 `document.elementFromPoint(x, y)` 从最近元素向上解析，因此代码、链接和附件会优先于所属消息。响应只包含 v1、requestId、短 targetId、目标类型、安全展示元数据和固定 capability。

`contextMenu.execute` 会按坐标重新解析并同时核对 targetId、目标类型和 capability，再调用左键共用的复制、Web Preview、Workspace Preview 或资源下载处理器。虚拟列表回收、流式更新或 DOM 位移使目标变化时无操作。该桥只通过 `electronAPI.onFromMain` 安装动作监听，不安装 DOM `contextmenu` 监听，也不调用 `preventDefault()`；普通浏览器继续使用浏览器原生菜单。

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
- `../src/features/transport/contracts/generated/agentWebclientBridge.ts`
- `../src/features/transport/lib/desktopBridge.ts`
- `../src/features/transport/lib/desktopWorkPanelTransport.ts`
