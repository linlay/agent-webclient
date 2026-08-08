# Artifact发布与资源预览

## 当前状态
Artifact 是运行中后端通过 `artifact.publish` 事件发布的资源文件。前端把事件中的 artifacts 归一为 `PublishedArtifact`，显示在底部浮动 Artifact 面板和右侧 Overview 中，并复用 AttachmentCard 与 Preview Panel。

## 核心职责
- 解析 `artifact.publish` 事件中的文件名、URL、mimeType、size、sha256。
- 维护 `state.artifacts`，按 artifactId upsert。
- 支持图片、PDF、HTML、文本、音频、视频、Office 等预览类型。
- 识别当前 Chat 的 `<relativePath>` ChatScope URL，并只在统一 API client 内加入当前 chatId，通过实际 `/api/resource?file=...` 鉴权 fetch 下载或读取资源。

## 核心流程
Timeline tool processor 识别 `artifact.publish`，调用 `normalizePublishedArtifacts` 生成命令，reducer 写入 artifacts。UI 层由 `ArtifactPanel`、`OverviewTab`、`AttachmentPreviewPanel` 渲染列表、预览和下载动作。

Artifact、普通附件和回答 Markdown 中的受保护图片都先使用 Bearer/Cookie fetch 获得后端原始 MIME Blob，再创建短生命周期 object URL 交给 `img`、PDF/HTML iframe、audio 或 video；卸载或 URL 变化时通过 effect cleanup revoke，同时用 AbortController 取消过期请求。新 `publishedArtifacts[].url` 形如 `artifacts/run_01/poster.png`。历史 `/api/resource?file=...` Markdown 被分类为非法，不再预览或下载；外部 HTTP(S) 图片继续直接使用外链，跨域下载不发送平台 Bearer，`data:` 与 `blob:` 原样展示。

回答 Markdown 兼容 `![说明](artifacts/run_01/demo.mp4)` 类历史输出：当图片语法的资源名以 `.m4v`、`.mov`、`.mp4`、`.mpeg`、`.mpg`、`.ogv` 或 `.webm` 结尾时，`MarkdownContent` 将其升级为带 controls 的鉴权 video 渲染；普通图片继续使用 `img`。若受保护资源的 Blob MIME 为空或 `application/octet-stream`，则按已识别的视频扩展名补齐 `video/*`，已有具体 MIME 不会被覆盖。该后缀判断仅用于兼容 Markdown 无标准视频语法的边界，Artifact 面板仍优先按自身的 MIME/扩展名规则识别预览类型。

Desktop 右键语义只把附件名称、媒体类型和固定 preview/download capability 返回宿主，不返回上述 object URL、资源 API URL 或鉴权信息。执行时重新定位当前 AttachmentCard/Markdown 资源，并复用左键的预览状态构造或 `downloadResource`/`downloadArtifactResource` 鉴权下载路径。

## 边界与非目标
- Artifact 不负责用户上传；用户上传属于 Composer 附件链路。
- Resource URL 的权限、ticket 和文件存储由后端负责。
- ChatScope 路径始终相对于当前 chatId；带当前 chatId 前缀、路径穿越、`file://`、Windows/UNC 和真实 `/api/resource` 均拒绝。普通 Agent 可读取 Workspace POSIX 绝对路径和 `/tmp/...`，请求必须带当前 chatId；Team Chat 在前端直接拒绝全部绝对路径，后端再次兜底。
- 前端预览失败时可降级下载，不尝试修复文件内容。

## 相关文件
- `../src/features/events/lib/processors/eventProcessorTool.ts`
- `../src/features/events/lib/processors/eventProcessorShared.ts`
- `../src/features/artifacts/components/ArtifactPanel.tsx`
- `../src/features/artifacts/components/AttachmentCard.tsx`
- `../src/features/artifacts/lib/attachmentPreview.ts`
- `../src/app/layout/sidebar/right/AttachmentPreviewPanel.tsx`
- `../src/shared/ui/MarkdownContent.tsx`
- `../src/shared/ui/useAuthenticatedResourceUrl.ts`
