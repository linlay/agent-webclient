# Artifact发布与资源预览

## 当前状态
Artifact 是运行中后端通过 `artifact.publish` 事件发布的资源文件。前端把事件中的 artifacts 归一为 `PublishedArtifact`，显示在底部浮动 Artifact 面板和右侧 Overview 中，并复用 AttachmentCard 与 Preview Panel。

## 核心职责
- 解析 `artifact.publish` 事件中的文件名、URL、mimeType、size、sha256。
- 维护 `state.artifacts`，按 artifactId upsert。
- 支持图片、PDF、HTML、文本、音频、视频、Office 等预览类型。
- 通过 `/api/resource` 下载或读取资源文本。

## 核心流程
Timeline tool processor 识别 `artifact.publish`，调用 `normalizePublishedArtifacts` 生成命令，reducer 写入 artifacts。UI 层由 `ArtifactPanel`、`OverviewTab`、`AttachmentPreviewPanel` 渲染列表、预览和下载动作。

## 边界与非目标
- Artifact 不负责用户上传；用户上传属于 Composer 附件链路。
- Resource URL 的权限、ticket 和文件存储由后端负责。
- 前端预览失败时可降级下载，不尝试修复文件内容。

## 相关文件
- `../src/features/timeline/lib/eventProcessorTool.ts`
- `../src/features/timeline/lib/eventProcessorShared.ts`
- `../src/features/artifacts/components/ArtifactPanel.tsx`
- `../src/features/artifacts/components/AttachmentCard.tsx`
- `../src/features/artifacts/lib/attachmentPreview.ts`
- `../src/app/layout/sidebar/right/AttachmentPreviewPanel.tsx`

