# Desktop宿主桥接

## 当前状态
WebClient 已消费 canonical generated Desktop bridge，通过固定只读全局 `__AGENT_WEBCLIENT_REALTIME_BRIDGE__` 与 `__AGENT_WEBCLIENT_WORKPANEL_BRIDGE__` 接入 Main Broker 和 WorkPanel。现有 Desktop context、截图、文件系统和右键桥接继续服务各自能力，但不作为 realtime fallback。

## 核心职责
- 严格判断 `DESKTOP_APP`：只接受布尔 `true` 或精确字符串 `"true"`。
- 向宿主发送 route、workspace、screenshot、file system 等请求或通知。
- 缺少 canonical realtime bridge 时阻断所有 guest 业务 Surface，避免 guest 直连 Platform。
- 将 Run attach、Push 和受控 OpenTarget 映射到 canonical bridge；WebClient 不维护 WorkPanel workspace/tab state。
- 将 Desktop 截图结果转换为 Composer 可上传文件。
- 在 query payload 中补充宿主提供的上下文。

## 核心流程
Provider 在 Desktop bridge 结构存在时渲染页面，按首次能力使用懒执行 hello。version mismatch 是全局稳定阻断；surface/capability denial 留在具体操作中，避免普通管理路由白屏。Run 与 Push 共用一个宿主 listener；WorkPanel 只接收 canonical descriptor，稳定身份来自 chatId/runId/projectId/artifactId/nodeId/project-relative path，失败时不调用 `window.open` 或旧 Action。

Bridge v2 的新 query 只发送 `operationId/owner/payload` 与可选已有 `chatId`，绝不发送预造 `runId`；`run.accepted` 回填 Platform canonical identity，随后释放 acceptance 前事件。query batch 按 operation、attach batch 按 subscription 精确定向；统一 `detach` 只停止当前 Surface 投递。interrupt、awaiting/tool submit、steer 与 access-level 返回真实 Platform `ApiResponse`，BTW 与 Desktop Terminal 继续明确 unsupported。

Bridge v2 是完全不兼容升级。缺失 bridge、v1 method shape、hello/message version 错误或旧 Program manifest 都必须稳定阻断，不安装 adapter、不回退 Standalone，也不重新提交 query。vendored contract hash、WebClient bundle 与 Desktop 内置资源必须同批生成、发布和回滚。

## 边界与非目标
- Standalone 浏览器独立运行；Desktop 标记一旦启用就不得降级为 Standalone。
- `webclient.*` Action 只在 Standalone 根路由注册；Desktop WorkPanel 使用正式 `desktop.workpanel.*` 语义，不恢复 sidebar Action 映射。
- Agent WebClient guest 不读取、缓存或接收 access token；Desktop host 对 manifest 声明过鉴权的 `/api` HTTP 请求在 Main 内注入并在一次 401 后刷新。
- Agents、Archives、Automations、Memory 和 Registries 等管理路由使用普通 HTTP，Desktop 不再为它们传递 `wsSource`。
- Program manifest 只保留带 `agent-platform-access-token` 的 HTTP-only `/api` 与独立可选 `/api/voice`；不得声明 `/auth`、主 `/ws`、query/attach SSE 或通用 `/api` WebSocket。
- Desktop 负责把 WebView 容器铺满主内容区，WebClient 的独立管理路由负责用页面布局填满 guest viewport；宿主不得注入 CSS 修补 guest 页面高度。
- Program Bundle 的静态托管由 Desktop main process 负责，不在前端启动服务。
- 宿主 API 的权限和文件系统访问由 Desktop 端控制。
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
