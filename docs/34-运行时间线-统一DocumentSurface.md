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
- Standalone HTML 提供源码、sandbox 预览和元素批注；Standalone 图片对 PNG/JPEG/WebP 提供基础 Canvas 编辑和区域批注，其他格式保持只读。

### HTML 元素批注

HTML 预览在预览工具栏提供“批注”入口，进入后工具栏切换为“返回预览 / 点击页面元素添加批注 / 批注 n/50 / 刷新”。批注态只处理元素级选择，不改变文档源码，源码/分屏入口在批注态隐藏；退出批注后仍可切换源码/分屏，切换前确认会丢弃元素批注。
点击元素后打开独立的待填写批注弹窗；批注列表由“批注 n/50”按钮单独打开，两个面板互不共用，关闭列表不会取消正在填写的批注。

- 预览 iframe 使用不带 `allow-same-origin` 的 sandbox `srcDoc`，在 `<head>` 起始处、页面自身 CSP meta 之前注入受限桥脚本；宿主只接收 `html-element-selected`、`annotation-invalid`、`annotation-valid` 和 `ready` 事件，只向 iframe 同步 `id/number/fullXPath`，用户填写的要求文本不会回传给被批注页面。
- 点击元素记录 XPath、可选 CSS 选择器、标签名、白名单属性、脱敏文本摘要和文档坐标矩形；批注态阻止页面点击、表单提交、链接跳转、拖拽和文本选择，但保留滚动。悬停与重绘按帧合并，滚动、窗口尺寸、目标尺寸和 DOM 变化会触发重算。
- 单文档最多 50 条，单条要求 1–1000 字符；已确认批注按列表顺序从 1 连续编号，删除后重排。目标元素消失或尺寸为 0 时该条标记为“目标已不存在”，保留可见但不可提交；恢复后重新可提交。
- 刷新或内容变化会清空批注并退出批注态；存在批注或待填写批注时刷新先确认“批注和未保存修改将丢失”。浏览器 `beforeunload` 也会拦截关闭窗口。
- “交给智能体”只提交目标存在且要求非空的批注，生成人类可读文本写入当前 Composer（不覆盖已有内容）并携带结构化 `reviewData`；未找到可接收的 Composer 时保留批注并提示失败。
- 安全边界：被批注页面脚本与桥脚本同处一个沙箱文档，页面若读取内联脚本中的 token 理论上可伪造选择消息，这是“无 `allow-same-origin` + 窄 postMessage”方案下已知的残余风险；宿主仍对选择字段做长度、白名单、坐标和文本脱敏校验，跨源 iframe 只命中 iframe 元素本身，不进入其内部。旧的 Desktop `previewReview` HTML 分支只作为无法进入 Document Surface 时的兼容兜底，不再与本文的浏览器元素批注同时声明能力。

文档内容区不复用浏览器地址栏。文件名只显示在 WorkPanel Tab；Markdown 工具栏只包含预览/源码、预览选区批注和保存，文本/代码只包含批注和保存。保存统一先询问保存方式：Workspace File 默认并且只能覆盖原文件，Artifact 默认新建产物且可明确选择覆盖，Reference 只能新建产物。重新加载权威 revision 位于同一行的更多菜单，存在 dirty 修改时先确认丢弃。普通 Web、WebApp 与 loopback 实时网站仍保留刷新和地址栏。

Document Surface 向 Desktop 宿主只提交当前可信 WorkPanel item 的 dirty、busy、annotation count 与“交给智能体”动作。Standalone 直接写入当前 Composer；Desktop 由宿主校验 owner Chat 和 item 后追加 Composer 草稿，不覆盖也不自动发送。

## 路由、标题与兼容

Markdown 的 Chat 产物链接只从当前 Chat 的权威产物投影恢复来源身份。同一规范路径重复发布时，按发布时间选择最新产物；时间相同时使用投影中后出现的记录，不能因存在多个历史 artifactId 而改走另一套 Viewer。没有匹配记录时保留普通资源打开方式；路径规范化与 owner Chat 校验保持不变。

`/file-viewer` 和 `/resource-viewer` 保留为历史入口，但内部都归一到 Document Surface。WorkPanel item 的稳定身份由来源决定，不因 Desktop native/WebClient renderer 变化而产生重复 Tab。

File descriptor 标题固定使用“显式 title > path basename > `file`”。basename 同时识别 POSIX、Windows 和 UNC 分隔符，但不对路径做 URL decode；标题仍通过既有空白、控制字符和长度清理。

Desktop bridge v6 的 `openDocument` 只有在明确返回 `unsupported_native_type` 时才允许回退 WebClient。授权、缺失、路径、身份和 revision 错误全部 fail closed。`DESKTOP_APP=true` 且 canonical contract 不兼容时阻断业务 Surface，不降级 Standalone。

上传 Reference 的语义相对路径允许 Chat 根目录的单个文件名，也兼容 `references/` 下的资源；来源身份不依赖必须存在某个目录前缀。非 Reference 不接受根目录路径，所有来源仍须经过 owner Chat、路径规范化和 realpath 边界校验。根目录 HTML Reference 只可读取自身，不因此获得其他 Chat 文件或相邻资源的读取权限。
