# Desktop宿主桥接

## 当前状态
现有 Desktop context、截图、文件系统和右键桥接继续服务各自的宿主能力，但不构成可信 realtime bridge。Realtime/WorkPanel/Terminal adapter 已进入硬暂停：canonical generated contract 与 trusted preload bridge 尚未交付时，`DESKTOP_APP=true` 只显示阻断页，不回落 Standalone。

## 核心职责
- 严格判断 `DESKTOP_APP`：只接受布尔 `true` 或精确字符串 `"true"`。
- 向宿主发送 route、workspace、screenshot、file system 等请求或通知。
- 缺少 canonical realtime bridge 时阻断所有 guest 业务 Surface，避免 guest 直连 Platform。
- 将 Desktop 截图结果转换为 Composer 可上传文件。
- 在 query payload 中补充宿主提供的上下文。

## 核心流程
当前阶段不实现 Desktop Realtime/OpenTarget adapter，也不复用基于 `window.parent` 的宽泛 bridge 作为可信通道。以下交付物必须全部到位后才能恢复实现：canonical generated realtime/workpanel/terminal contract；trusted bridge 的全局入口、hello、version、capability；surface registration、Run binding、push 与 terminal envelope；`desktop.workpanel.openItem/activateItem/closeItem`；以及可观察 listener/pending/observer 计数的 Fake Broker fixture。

恢复后 WebClient 只把 generated contract 映射为领域 transport，并发送受控 OpenTarget intent；WorkPanel tab 列表、单物理 Platform WS、同 Run attach 去重和跨 Surface 扇出由 Desktop Main/Broker 负责。hello/version/capability 失败立即阻断；accepted 后任何错误不得切换到 Standalone 重发。

## 边界与非目标
- Standalone 浏览器独立运行；Desktop 标记一旦启用就不得降级为 Standalone。
- `webclient.*` Action 只在 Standalone 根路由注册；Desktop inbound 能力等待 canonical contract。
- `desktopAuthContext` 只由认证 bridge 响应传递，不从页面 URL 读取或传播。
- Desktop 模式下，当前文档尚未收到认证上下文时，不复用 `sessionStorage` 中的历史 token。
- Agents、Archives、Automations、Memory 和 Registries 等管理路由使用 HTTP/SSE，Desktop 不再为它们传递 `wsSource`。
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
