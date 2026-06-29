# Viewport视图容器

## 当前状态
Viewport 是后端提供 HTML 视图的前端渲染容器，入口包括 content 中的 ```viewport fenced block、FrontendTool、HITL form。前端通过 `/api/viewport?viewportKey=...` 获取 HTML，并用 iframe `srcDoc` 渲染。

## 核心职责
- 解析 content 文本中的 viewport block，提取 key 和 payload。
- 拉取 viewport HTML 并注入 iframe。
- 通过 `postMessage` 向 iframe 发送 init/update 数据。
- 为 timeline 内嵌视图、前端工具视图和 awaiting form 视图提供共通模式。

## 核心流程
content segment parser 识别 ```viewport block 后生成 viewport segment，`ContentBlock` 渲染 `ViewportEmbed`。`ViewportEmbed` 拉取 HTML，iframe load 后发送 payload。FrontendTool 和 AwaitingHtmlContainer 复用相同的 getViewport + iframe + message 模式，但提交协议各自独立。

## 边界与非目标
- Viewport 不是 Artifact；Artifact 是文件资源，Viewport 是 HTML 交互视图。
- 前端不信任 iframe 内容，必须使用 sandbox。
- `/api/viewport` 的 HTML 来源和权限由后端负责。

## 相关文件
- `../src/features/timeline/lib/contentSegments.ts`
- `../src/features/tools/lib/viewportParser.ts`
- `../src/features/timeline/components/ViewportEmbed.tsx`
- `../src/features/timeline/components/ContentBlock.tsx`
- `../src/features/tools/components/AwaitingHtmlContainer.tsx`
- `../src/features/tools/components/FrontendToolContainer.tsx`

