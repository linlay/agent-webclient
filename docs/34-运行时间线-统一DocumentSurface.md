# 统一 Document Surface

## 定位

Document Surface 把 Workspace File、Artifact 和 Reference 的打开逻辑统一成“来源身份 + 权威内容类型”。来源决定保存语义，类型决定编辑器或 Viewer；Main Chat、Markdown 文件链接、Project 和资源卡片不再分别选择 HTML/Text Viewer。

Standalone 全部由 WebClient 承载。Desktop 模式先用 canonical `openDocument` 提交语义来源；宿主只原生承载 HTML 和图片，其他类型仍使用本 Surface。

## 来源和提交

- Workspace File 只能使用当前不透明 revision 原位覆盖。
- Artifact 默认创建新 Artifact，用户可明确选择带 revision 覆盖原产物。
- Reference 永不覆盖，只能创建新 Artifact。

WebClient 不解析 revision，也不把临时扩展名分类当成最终事实。读取链路返回的 MIME、内容类型与 revision 会覆盖 provisional 分类；保存统一进入 Platform `document.commit`，`revision_conflict` 必须向用户显示重载或另存选择。

Resource metadata 缺少权威 `X-Document-Kind` 时不把“缺字段”解释成 binary，继续保留按语义文件名得到的 provisional 分类。权威 kind 为 binary 且语义文件名是已知文本扩展名时不进入编辑器，显示“文本编码不受支持”及下载入口；metadata 同时消费 `X-Document-Revision` 作为不透明源版本，并用 `Content-Length` 展示准确大小。

## 内容能力

- Markdown、文本和代码使用 Monaco。具备可视化预览的文档在首次打开或切换文档时默认进入预览。Markdown 只保留预览和源码两种模式：源码使用 Monaco 直接编辑，预览用于阅读和选区批注，不提供分屏，不执行 MDX 或内联 HTML 脚本。
- 源码文本批注以 revision、line/column range 和 selected-text hash 锚定；Markdown 预览选区在能唯一对应原文时同时保留 line/column，格式化后无法直接对应的选区保留脱敏原文和 hash。本地编辑期间由 Monaco decoration 跟随，外部 revision 变更后显式失效。
- PDF 使用本地 PDF.js 只读 Viewer，支持页码、缩放与搜索。
- Office 文档（含 DOCX、PPTX、XLSX）统一显示文件元信息、下载及当前环境可用的系统打开/定位操作。正文仅通过现有在线预览服务展示；未配置服务时显示“未配置在线预览服务”，不读取或渲染客户端 DOCX 正文。已配置时按 Platform 能力、格式和大小启用在线预览，沿用共享请求与展示流程，Desktop 嵌入和 Standalone 行为一致，详见 [Office 在线预览](33-运行时间线-Artifact发布与资源预览.md#office-在线预览)。Reference 原件不被修改。音视频使用媒体播放器；压缩包和未知二进制不读为文本，也不自动下载。
- Standalone HTML 提供源码和 sandbox 预览；Standalone 图片对 PNG/JPEG/WebP 提供基础 Canvas 编辑和区域批注，其他格式保持只读。

文档内容区不复用浏览器地址栏。文件名只显示在 WorkPanel Tab；Markdown 工具栏只包含预览/源码、预览选区批注和保存，文本/代码只包含批注和保存。保存统一先询问保存方式：Workspace File 默认并且只能覆盖原文件，Artifact 默认新建产物且可明确选择覆盖，Reference 只能新建产物。重新加载权威 revision 位于同一行的更多菜单，存在 dirty 修改时先确认丢弃。普通 Web、WebApp 与 loopback 实时网站仍保留刷新和地址栏。

Document Surface 向 Desktop 宿主只提交当前可信 WorkPanel item 的 dirty、busy、annotation count 与“交给智能体”动作。Standalone 直接写入当前 Composer；Desktop 由宿主校验 owner Chat 和 item 后追加 Composer 草稿，不覆盖也不自动发送。

## 路由、标题与兼容

`/file-viewer` 和 `/resource-viewer` 保留为历史入口，但内部都归一到 Document Surface。WorkPanel item 的稳定身份由来源决定，不因 Desktop native/WebClient renderer 变化而产生重复 Tab。

File descriptor 标题固定使用“显式 title > path basename > `file`”。basename 同时识别 POSIX、Windows 和 UNC 分隔符，但不对路径做 URL decode；标题仍通过既有空白、控制字符和长度清理。

Desktop bridge v6 的 `openDocument` 只有在明确返回 `unsupported_native_type` 时才允许回退 WebClient。授权、缺失、路径、身份和 revision 错误全部 fail closed。`DESKTOP_APP=true` 且 canonical contract 不兼容时阻断业务 Surface，不降级 Standalone。

上传 Reference 的语义相对路径允许 Chat 根目录的单个文件名，也兼容 `references/` 下的资源；来源身份不依赖必须存在某个目录前缀。非 Reference 不接受根目录路径，所有来源仍须经过 owner Chat、路径规范化和 realpath 边界校验。根目录 HTML Reference 只可读取自身，不因此获得其他 Chat 文件或相邻资源的读取权限。
