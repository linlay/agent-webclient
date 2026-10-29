# VIEW 连接器

连接器管理界面并列提供 MCP / CLI / VIEW，组件文件为 `mcp.json/cli.json/view.json`，支持混合包。VIEW 负责展示，数据查询与执行继续由 Tool/MCP/CLI 承担。

## 数据接入

- `GET /api/view` 和同名 WS route 接受 `source/chatId/connectorId/key/hash/usage?`，usage 为 `display | form`；connector 必须带 hash，缺失时平台返回 `view_snapshot_required`。沿用统一响应包裹与鉴权。
- data 为 `{view,entry?,html?,qlc?,assets?}`；view 含 `source/connectorId/key/version/hash/renderer`，asset 含 `path/mediaType/data(base64)`。客户端不提供 Agent、路径或远端 URL。
- `tool.result.view` 展示原始 result；`awaiting.ask(mode=form).view` 决定模板。`viewError` 表示服务端冻结失败，不重试成另一个版本；保留原结果和表单拒绝入口。
- hash 是服务端在发事件前保存的 Chat 快照。回放和归档继续使用同一 hash，不能把它换成当前模板；客户端不发起无 hash 的连接器请求。

## 展示协议

`ViewEmbed` 发送 `{type:"view_init" | "view_update",data:{view,payload}}`。没有执行或提交消息处理器。`viewDocumentHTML` 只内联声明资源并注入 CSP；所有新 VIEW 使用 `sandbox="allow-scripts"`，不授予同源或宿主桥接权限。应安装可信模板包。

display 文档在 head 最前注入宿主适配脚本 `window.viewHost`（不属于快照；内置与外部连接器的 VIEW 共用同一接口，查询来源 native/cli/mcp 对模板透明）：

- `onData((payload, view, context) => …)` 接收 init/update（晚注册也会收到最近一次数据）；`context` 含 `queryable`、`locale`、`colorScheme`（应用主题，而非系统主题；脚本写入 `<html data-color-scheme>`），查询块另含 `query:{name,params}` 与首次查询完成时间 `executedAt`（Unix 毫秒），首次查询失败时含 `error`。
- `query(name, params)` 返回 Promise，成功时为 `{data, executedAt}`。它发送 `view_query`，`ViewEmbed` 只对自身 iframe、快照 `queries` 声明的查询调用 `queryView`（`POST /api/view/query`，带内容节点的 `runId`，响应 `{data,executedAt}`），回复 `view_query_result`（`{id,ok,data,executedAt}` 或 `{id,ok:false,error}`）。同一 iframe 内同名查询以最后一次为准：较早请求的结果被丢弃并以 `view_query_superseded` 拒绝（不中断平台执行，模板可忽略该错误）；不同查询名互不影响。连接器失败保留 `connector_auth_required` 等错误码交给模板提示。没有 runId 的工具结果 VIEW 不可查询。
- 历史快照兼容：宿主同时保留 `window.zenmindView`，复用同一套 `onData/resize` 和查询桥；旧 `query()` 仍直接返回业务数据，新 `viewHost.query()` 返回 `{data, executedAt}`。不改写历史模板或快照 hash，新模板使用 `viewHost`。
- `resize()` 手动上报；默认 ResizeObserver 发送 `{type:"view_resize",height}`。`ViewEmbed` 只接受来自自身 iframe 的尺寸消息，高度由 HTML 内容决定，仅设 48px 下限、不设上限（内容不应按 vh 定高，否则会随 iframe 循环增高），首次上报前 320px；HITL 表单宿主仍按原规则限高。表单文档不注入。

### Markdown VIEW 块

助手正文写作 ` ```view key=<connectorId>/<viewKey> `，正文只放一个 JSON 对象或数组；带 `query=<name>` 时正文是该查询的参数对象，`ViewEmbed` 以它执行首次查询后再发送 `view_init`。`contentSegments.parseContentSegments` 按逐行语法分段：栅栏须在行首、恰好三个反引号，属性接受 key 与可选 query，其他代码块内的 view 栅栏保持为代码；VIEW segment 带 `index`（已闭合 VIEW 块序号）、`key`、可选 `query`、`payloadRaw`、原始块 `text` 与 `closed`。语法与平台 `internal/view.ParseMarkdownBlocks` 共用 golden 用例 `events/lib/__fixtures__/view_markdown_cases.json`，修改须两边同步。

模板只由平台绑定：`content.view` 与 `content.snapshot.views` 写入内容节点的 `viewBindings[index]`，后续 delta/end 保留。`ContentBlock` 对已绑定块调用 `renderContentView(segment, chatId, binding, node.runId)`；流式中尚未绑定显示加载中；内容结束仍无绑定（ACP/PROXY、历史旧 JSON 信封）按原始代码块显示；`viewError` 显示错误并可展开原始数据。

### 数据来源 header

所有展示类 VIEW 在 iframe 外显示统一的轻量 header，包括加载、失败与无绑定的原始块兜底；HITL 表单保持独立展示。

- 正文直接携带数据时显示“视图 · 静态数据”，说明初始内容来自消息保存的数据；声明 `query=` 时显示“视图 · 动态查询”，说明结果可能与消息生成时不同。
- header 右侧依次提供“Dialog 打开”和“侧边栏打开”两个按钮，模板就绪后可用。侧栏入口复用主界面现有右侧栏，新增并激活 VIEW tab；同一来源重复打开复用 tab，不覆盖其他类型标签。侧栏沿用现有标签切换、关闭、宽度持久化和拖拽交互，主聊天保持原有 420px 最小宽度，拖到该边界后保持布局，继续向左拖过 96px 缓冲则侧栏覆盖主聊天并将其隐藏；向右拖回立即恢复，行为对齐 Desktop。最大宽度扣除左侧导航实际占用并保留 6px 操作缝隙；不另建侧栏容器。VIEW tab 保留同一 Chat/Run/hash、正文、查询参数和 iframe 安全隔离，流式正文继续同步，动态查询独立执行；切换 Chat 清理 VIEW 标签，独立 Agent/Copilot 页面沿用 Dialog 入口。Dialog 保留原有行为：以最大 1280px、随视口收缩的 Dialog 展示同一 Chat/Run/hash、正文与查询参数的 VIEW，Dialog 固定为视口高度的 80%（80dvh）并垂直居中，header 固定，正文区提供统一滚动条；少量数据时保留留白，超出正文区时滚动，可用关闭按钮、Escape 或遮罩关闭。动态查询在 Dialog 打开时重新执行，独立显示查询状态与时间，Dialog 内不提供重复放大入口，关闭不改写原消息或内联视图状态。
- 查询时间靠右展示，点击或键盘激活时间可弹出带感叹号的说明；模式文字也可点击查看说明。Dialog 移除独立标题栏，由同一行 header 合并标题、模式、查询状态、时间与关闭按钮，并缩小顶部留白；样式沿用主题的次级文字、分隔线，动态查询使用主题强调色。
- 初始查询和 iframe 发起的查询共用状态：查询中、查询失败、更新失败、静态数据已查询更新。成功后按平台返回的 `executedAt`（查询完成时间）显示本地时间，跨日带日期，不作为业务记录的更新时间或持久化历史；被同名新查询取代的请求不计为失败。
- 正文数据视图也可调用已声明的 query，成功后仍标识其初始来源并追加“已查询更新”。多个并发查询全部结束前保持查询中，失败保留上次成功时间；具体内容保留与错误呈现由模板负责。切换 Chat、Run、模板或查询参数时清除旧状态，旧请求不会写入新 header。

## HITL

表单独立于 renderer：`mode: form` 可使用 HTML 或 QLC。宿主发送 `awaiting_init/awaiting_update`（含 `runId/awaitingId`、单个 `form: {title?,data}` 和 view；不发送 `form.id`、`activeFormId` 或 forms 数组）。用户点击同意或拒绝后发送 `awaiting_collect`（`decision: submit | reject`），模板响应 `frontend_awaiting_submit`，`param` 为 `{decision:"approve"|"reject", data}`；数据不完整时可回复 `frontend_awaiting_invalid`，宿主提示后保留表单。form 用途不注入 viewHost，模板直接处理上述消息。

连接器 CLI 拦截审阅也走这套协议：Agent 直接调用 `view.json` 中 `intercept: true` 的命令时，`form.data` 为 `{action, params}`，模板回复 `data: {params}`，平台校验后按模板重建命令执行。form 用途的快照不含 queries 和 actions，模板不能自行写入。契约见 Platform 的 `docs/VIEW连接器.md#cli-拦截审阅`。

只接受当前 iframe、宿主正在收集且 id 属于当前表单的响应。宿主固定路由，通过原 `/api/submit` 提交；拒绝同样先向模板收集当前数据，模板未响应或视图加载失败时宿主直接提交不带数据的拒绝，模板不能自行批准。加载失败不转成默认批准。

Team 外层仍使用汇总 HITL，成员 VIEW 位于 `forms[i].form.view`。宿主为当前成员创建隔离的 frame 数据，只向它发送自己的 forms；收集结果包装到外层对应的 `form.params`，保留其他成员路由。

## 实现与限制

主要实现：`shared/contracts/view.ts`、`shared/data/api/requests/views.ts`、`shared/utils/viewDocument.ts`、`timeline/components/ViewEmbed.tsx`、`tools/lib/viewFrame.ts` 与 `tools/hooks/useAwaitingFrameDocument.ts`。

QLC 当前提供 JSON 展示和 JSON 表单兜底，尚未解释专有控件。资源应预打包，暂不支持 CSS @import、JS 模块依赖解析或远端 CDN。在线回放支持 VIEW，独立会话 HTML 导出不内联模板。旧 `/api/viewport` 与旧 viewport fence 已移除。builtin 来源使用 native 或 HTML；Desktop 与 ACP bridge 同步携带统一 view 引用。

包结构、远端模板协议、凭据、错误码和迁移步骤以相邻 Platform 的 `docs/VIEW连接器.md` 为完整契约。

内置请求使用 `source=builtin&key=...`，无需连接器；连接器使用 `source=connector` 并沿用 Chat/hash 授权。HTTP/WS 同形，source 必填。

## 用户操作与写入

连接器 display VIEW 可声明独立的 actions，模板通过 `viewHost.invoke(name, params)` 提交结构化参数。WebClient 只接收当前 iframe 的消息，按声明展示可信宿主确认框，确认后调用 `/api/view/invoke`（Platform HTTP/WS；Gateway 暂用 HTTP 路由）。浏览器继续使用 `sandbox=allow-scripts` 和 `form-action/connect-src 'none'`。

请求由宿主绑定 Chat、发布 Run 和 VIEW hash；平台检查在线 Chat 所有权、Run 归属、当前 Agent 连接器挂载和当前安装包中的同名动作。动作变更或撤销时拒绝旧快照写入。CLI 使用结构化 argv 和可选 JSON stdin，MCP 只调用包自身组件；凭据仅服务端注入。宿主对同一会话 VIEW、动作和规范化参数复用 sessionStorage 请求 ID，平台收据在调用前持久化；请求不会自动重试或切换传输重放。取消不调用 API；超时或未知结果应回查，不重发。

批量写入使用 `viewHost.invokeBatch(name, entries)`，同一声明动作最多 50 条参数，总参数 JSON 不超过 256K 字符；键序无关的重复条目返回 `view_action_params_invalid`（重复条目共用请求 ID，会被平台收据当成同一次写入）。宿主复制整批参数，在一个汇总表格中展示（列名优先使用动作 paramsSchema 的 title），用户确认一次后依次调用原 `/api/view/invoke`，每条参数保留独立的鉴权、幂等键与收据。取消整批不调用接口；执行期间防止重复确认，遇到错误或非零退出码停止后续记录，切换视图停止余下派发。返回 `{data:{results:[{ok:true,...单条结果}|{ok:false,error}]}}`，未出现在 results 的后续条目尚未提交；模板应保留成功项和未知项，不自动重发。单条 `invoke` 的确认与返回契约不变。

`invoke` 返回 `{data,executedAt,invocationId,exitCode}`，业务错误保留原 JSON 结果供模板识别 outcome。模板应把写入结果与后续回读失败分开展示，不将回读失败解释为写入失败。归档和旧宿主可能无法操作，以平台校验为准；旧快照不会自动增加动作。


## Desktop WorkPanel 承载

Desktop 模式的内嵌 VIEW 始终显示侧栏入口，包含使用 AgentChatShell 的主聊天；按钮显示不依赖 surfaceMode=main 或浏览器 RightSidebar。侧栏入口打开独立 View Surface，Dialog 和普通浏览器侧栏保持原交互；独立 WorkPanel 页面与展开 Dialog 不再显示嵌套的打开按钮。View Surface 与内嵌、Dialog 共用 ViewEmbed，所以 viewHost 查询、写入确认、CSP、错误和幂等语义一致；执行仍归 Agent Platform，HTML 不获得本机命令接口。

标签使用 Chat、Run、协议 contentId/toolId 和块序号定位。URL/descriptor 不传 HTML 或大 payload，独立页面按 Chat 回放恢复绑定的快照和原始数据。同源 BroadcastChannel 只同步当前聊天中已绑定实例的数据，并按每次页面请求身份、发布者 generation 和序号丢弃迟到内容；源页面重建时重新握手，关闭时释放，不增开 live Run 订阅。通道不构成执行授权，Platform 继续验证模板与声明。时间线渲染计数器和 React useId 不能用于 Desktop 恢复。

宿主须声明 workpanel.view 能力；能力缺失时显示升级提示，Desktop 不回退 WebClient 侧栏。View 子页面只取得所属 Chat 回放、display 模板和同一发布 Run 的查询/操作能力，不取得 query/attach 或新建标签权限。双方 generated contract 配套更新。
