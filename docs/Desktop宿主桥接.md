# Desktop宿主桥接

## 当前状态
Desktop 宿主桥接用于 ZenMind Desktop WebView 场景，前端通过全局标记和 postMessage 与宿主通信。现有能力包括宿主消息源判断、路由变化上报、截图桥接、文件系统目录选择和 query context 注入。

## 核心职责
- 判断当前是否运行在 Desktop WebView 桥接环境。
- 向宿主发送 route、workspace、screenshot、file system 等请求或通知。
- 将 Desktop 截图结果转换为 Composer 可上传文件。
- 在 query payload 中补充宿主提供的上下文。

## 核心流程
运行时检测 `__ZENMIND_DESKTOP_WEBVIEW_BRIDGE__` 等宿主标记。页面路由变化由 hook 通知宿主；Composer 需要截图时调用 screenshot bridge 并转为 File；发送 query 时可由 `buildDesktopQueryContext` 附加宿主上下文。

## 边界与非目标
- Desktop bridge 是可选能力，普通浏览器必须可降级运行。
- Program Bundle 的静态托管由 Desktop main process 负责，不在前端启动服务。
- 宿主 API 的权限和文件系统访问由 Desktop 端控制。

## 相关文件
- `../src/shared/data/desktopHostBridge.ts`
- `../src/shared/data/desktopScreenshot.ts`
- `../src/shared/data/desktopFileSystem.ts`
- `../src/shared/data/desktopQueryContext.ts`
- `../src/shared/hooks/useDesktopRouteChange.ts`
- `../src/shared/hooks/agentPage/useDesktopAction.ts`

