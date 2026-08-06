# Desktop宿主桥接

## 当前状态
Desktop 宿主桥接用于 Desktop WebView 场景，前端通过全局标记和 postMessage 与宿主通信。现有能力包括宿主消息源判断、路由变化上报、截图桥接、文件系统目录选择和 query context 注入。

## 核心职责
- 判断当前是否运行在 Desktop WebView 桥接环境。
- 向宿主发送 route、workspace、screenshot、file system 等请求或通知。
- 缺少或刷新访问令牌时，通过 Desktop agent auth bridge 重新申请 token。
- 将 Desktop 截图结果转换为 Composer 可上传文件。
- 在 query payload 中补充宿主提供的上下文。

## 核心流程
运行时检测 `__DESKTOP_WEBVIEW_BRIDGE__` 宿主标记。页面路由变化由 hook 通知宿主；`?newChat=` 收到稳定 `chatId` 后 replace 到 `?chatId=` 是当前 live query 的 URL 身份收敛，宿主只镜像地址和选中态，不回写该等价主聊天路由或触发 `popstate` 重放。Agent Copilot 同样以 `/copilot/:agentKey?chatId=<id>` 作为稳定会话 URL：新建会话、选择历史 chat 和清空会话都由 WebClient 更新地址，Desktop 只监听 WebView 导航并保存当前 surface 的安全相对路径，不增加 chatId IPC 或桥接消息。缺少 token 时发送 `desktop:agent-auth:request`，只接受 `desktop:agent-auth:response`；Desktop 在认证响应中同时传递 `desktopAuthContext`，页面先应用上下文并清理不匹配的旧 token，再写入新 token。Composer 需要截图时调用 screenshot bridge 并转为 File；发送 query 时可由 `buildDesktopQueryContext` 附加宿主上下文。

## 边界与非目标
- Desktop bridge 是可选能力，普通浏览器必须可降级运行。
- `webclient.*` Action 不经过 Desktop postMessage bridge；Platform 直接通过现有 `/ws` 控制连接向 WebClient 发起 request。Desktop Program Bundle 只需继续透明代理 `/ws`。
- `desktopAuthContext` 只由认证 bridge 响应传递，不从页面 URL 读取或传播。
- Desktop 模式下，当前文档尚未收到认证上下文时，不复用 `sessionStorage` 中的历史 token。
- Agents、Archives、Automations、Memory 和 Registries 等管理路由使用 HTTP/SSE，Desktop 不再为它们传递 `wsSource`。
- Desktop 负责把 WebView 容器铺满主内容区，WebClient 的独立管理路由负责用页面布局填满 guest viewport；宿主不得注入 CSS 修补 guest 页面高度。
- Program Bundle 的静态托管由 Desktop main process 负责，不在前端启动服务。
- 宿主 API 的权限和文件系统访问由 Desktop 端控制。
- `identity-center` 是 Desktop 侧的 token 签发基础，不作为 webclient 与 Desktop 的 postMessage 协议名称。

## 相关文件
- `../src/shared/data/desktop/desktopHostBridge.ts`
- `../src/shared/data/auth/appAuth.ts`
- `../src/shared/data/desktop/desktopScreenshot.ts`
- `../src/shared/data/desktop/desktopFileSystem.ts`
- `../src/shared/data/desktop/desktopQueryContext.ts`
- `../src/shared/hooks/useDesktopRouteChange.ts`
- `../src/shared/hooks/agentPage/useDesktopAction.ts`
