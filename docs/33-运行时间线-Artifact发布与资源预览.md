# Artifact发布与资源预览

## 当前状态
Artifact 是运行中后端通过 `artifact.publish` 事件发布的资源文件。前端把事件中的 artifacts 归一为 `PublishedArtifact`，显示在底部浮动 Artifact 面板和右侧 Overview 中，并复用 `AttachmentCard` 与统一的 Content Viewer。

## 核心职责
- 解析 `artifact.publish` 事件中的文件名、URL、mimeType、size、sha256。
- 维护 `state.artifacts`，按 artifactId upsert。
- 把资源归一为 DocumentTarget，支持文本编辑、只读预览和明确的元信息/下载状态，不把 Office、压缩包或未知二进制伪装为文本。
- 识别当前 Chat 的 `<relativePath>` ChatScope URL，并只在统一 API client 内加入当前 chatId，通过实际 `/api/resource?file=...` 鉴权 fetch 下载或读取资源。

## 核心流程
Timeline tool processor 识别 `artifact.publish`，调用 `normalizePublishedArtifacts` 生成命令，reducer 写入 artifacts。UI 层由 `ArtifactPanel`、`OverviewTab`、`AttachmentCard` 和 `ContentViewerPanel` 渲染列表、内容与下载动作。

Artifact、Reference 与普通附件先归一为 `ResourceViewerTarget`；Workspace File 归一为 `FileViewerTarget`。两者组成判别联合 `ViewerTarget`，再归一成包含语义来源和权威内容类型的 DocumentTarget。Sidebar 以来源 stable identity 管理 tab，`ContentViewerPanel` 只选择 `/api/resource` 或 `/api/file` 数据链路，不再自己推导保存语义。

Artifact 与 Reference 的 Standalone 独立 Viewer 统一使用 `/resource-viewer/:agentKey?chatId=...&file=...`，`file` 来自各自 `resourceTarget.url`，并复用同一 `ContentViewerPanel` 与路由注入的 ChatScope。没有可用资源 URL 时不输出独立链接；旧 `/artifact-view/:agentKey`、`/reference-view/:agentKey` 不保留兼容重定向。Workspace File 继续使用 `/file-viewer/:agentKey?path=...&line=...`，不请求 `/api/chat`，并保留行号定位。

Desktop 的展示所有权按权威内容类型分流：Main Chat、Project、Artifact 与 Reference 统一调用 v6 `openDocument`，只提交语义来源。HTML 与图片由 Desktop 原生 WorkPanel Surface 承载，WebClient 不创建重复 WebView；宿主明确返回 `unsupported_native_type` 时才打开 WebClient Document Surface。授权失败、资源缺失、身份或路径不匹配不得回退。旧 bridge 继续兼容历史 Viewer；Standalone 始终使用 WebClient。

Artifact、Reference、普通附件和回答 Markdown 中的文件链接都以 Viewer 为唯一左键入口。`artifacts/...`、`docs/...`、普通文件名等安全相对路径按当前 `chatId` 解释为 ChatScope 资源，打开 Resource Viewer；绝对 Workspace 路径仍打开 File Viewer。原链接、卡片、Viewer 根节点和 Viewer Tab 暴露右键下载 capability，Viewer 内不显示下载工具栏。左键打开失败、内容加载失败或文件类型不受支持时都不得自动触发下载。

Markdown、文本与代码使用 Monaco，PDF 使用 PDF.js，音视频使用浏览器媒体播放器。Office、压缩包和其他未知二进制保留只读元信息状态，不发起伪文本预览。Desktop 中的 Document Surface 可渲染“在 Finder/文件资源管理器中显示”和“用默认应用打开”，纯浏览器不渲染 Desktop-only 操作。宿主请求不携带绝对路径，并由 owner Chat 和当前可信 descriptor 双重校验。

Standalone 的文件标签右键菜单按“刷新、全屏 / 在文件管理器中显示、用默认应用打开 / 关闭”分组，以分隔线区分；打开菜单时隐藏标签悬浮提示，提示只保留文件名和大小。元信息卡展示名称、易读的文件大小与 MIME，大小按十进制单位换算（如 36,800 字节显示为 36.8 kB），不显示“Office 文档（只读）”副标题或本地副本说明。MIME 标签与值同行，值保持单行，超长时省略并可悬停查看完整值。四个按钮位于信息卡片内的下方，以适中宽度居中排列，不撑满卡片，依次为“在线预览（规划中）”、下载、Finder（其他系统使用相应文件管理器）、默认应用，每行一个；在线预览为禁用占位。两个本机操作复用 WebClient 本机文件服务，不依赖 Desktop 桥接。刷新重新读取文件与元信息，并更新媒体 Blob；存在未保存的编辑或批注时先确认丢弃，取消则保留当前内容。

Artifact、普通附件和回答 Markdown 中的受保护图片、PDF、音视频先使用 Bearer/Cookie fetch 获得后端原始 MIME Blob，再创建短生命周期 object URL 交给媒体元素；卸载或 URL 变化时通过 effect cleanup revoke，同时用 AbortController 取消过期请求。HTML Resource Viewer 则通过同一鉴权 API 读取完整文本并以不带 `allow-same-origin` 的 sandbox `srcDoc` 展示，使 Desktop 可注入受限的元素批注消息桥而不放宽 iframe 隔离；HTML iframe 使用无内边距内容槽贴边展示，页面本身的 body margin 仍按原文保留。受 CORS 限制而无法读取文本的外部 HTML 仍可回退到原 sandbox URL 只读预览，但不声明批注 capability。新 `publishedArtifacts[].url` 形如 `artifacts/run_01/poster.png`。历史 `/api/resource?file=...` Markdown 被分类为非法，不再预览或下载；外部 HTTP(S) 图片继续直接使用外链，跨域下载不发送平台 Bearer，`data:` 与 `blob:` 原样展示。

回答 Markdown 兼容 `![说明](artifacts/run_01/demo.mp4)` 类历史输出：当图片语法的资源名以 `.m4v`、`.mov`、`.mp4`、`.mpeg`、`.mpg`、`.ogv` 或 `.webm` 结尾时，`MarkdownContent` 将其升级为带 controls 的鉴权 video 渲染；普通图片继续使用 `img`。若受保护资源的 Blob MIME 为空或 `application/octet-stream`，则按已识别的视频扩展名补齐 `video/*`，已有具体 MIME 不会被覆盖。该后缀判断仅用于兼容 Markdown 无标准视频语法的边界，Artifact 面板仍优先按自身的 MIME/扩展名规则识别预览类型。

Desktop 内容区右键语义只把资源名称、媒体类型和固定 open/download capability 返回宿主，不返回上述 object URL、资源 API URL 或鉴权信息。执行时重新定位当前 AttachmentCard、Markdown 链接或 Viewer，并复用左键的 `ViewerTarget` 构造或统一鉴权下载路径。WorkPanel 的 Artifact/Reference 外层 tab 另通过共享契约的版本化 `workPanel.resource.downloadCurrent` host action 请求下载；只有当前 Resource Viewer 注册处理器并复用同一 `downloadViewerTarget`，其他页面静默忽略，动作本身不携带 route、资源 URL、路径或凭据。

Desktop 原生图片稳定后，WebClient 的 preview-review 只保留 HTML Resource Viewer 分支。HTML 仍位于不带 `allow-same-origin` 的 sandbox iframe，通过只接受当前 frame source 与运行期 token 的窄 postMessage 桥同步编辑状态、选择元素和重绘 XPath 编号框。PNG、JPEG、WebP 的批注、临时 PNG 合成和 Composer staged attachment 均由 Desktop 原生图片编辑器负责；PDF、音视频、文本与不支持格式不声明批注能力。

## 边界与非目标
- Artifact 不负责用户上传；用户上传属于 Composer 附件链路。
- Resource URL 的权限、ticket 和文件存储由后端负责。
- 前端只校验 Viewer 必填字段、受支持的 URL 类型和路由编码；真实 `/api/resource` 链接、外部 URL 与 inline URL 不伪装为受保护 Resource Surface。ChatScope、Workspace、canonical path、symlink、Team Chat 与越界访问均由 Platform 的 `/api/resource` 最终判定，前端不按本地 Worker 元数据或聊天类型提前授权。
- 前端预览失败时只展示错误，不自动下载，也不尝试修复文件内容。

## 相关文件
- `../src/features/events/lib/processors/eventProcessorTool.ts`
- `../src/features/events/lib/processors/eventProcessorShared.ts`
- `../src/features/artifacts/components/ArtifactPanel.tsx`
- `../src/features/artifacts/components/AttachmentCard.tsx`
- `../src/features/viewers/lib/viewerTarget.ts`
- `../src/features/viewers/lib/viewerRuntime.ts`
- `../src/features/viewers/components/ContentViewerPanel.tsx`
- `../src/features/viewers/hooks/useDesktopHtmlPreviewReview.ts`
- `../src/features/viewers/components/MarkdownContent.tsx`
- `../src/shared/ui/useAuthenticatedResourceUrl.ts`
