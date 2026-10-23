# VIEW 连接器

连接器管理界面并列提供 MCP / CLI / VIEW，组件文件为 `mcp.json/cli.json/view.json`，支持混合包。VIEW 负责展示，数据查询与执行继续由 Tool/MCP/CLI 承担。

## 数据接入

- `GET /api/view` 和同名 WS route 接受 `source/chatId/connectorId/key/hash/usage?`，usage 为 `display | form`；connector 必须带 hash，缺失时平台返回 `view_snapshot_required`。沿用统一响应包裹与鉴权。
- data 为 `{view,entry?,html?,qlc?,assets?}`；view 含 `source/connectorId/key/version/hash/renderer`，asset 含 `path/mediaType/data(base64)`。客户端不提供 Agent、路径或远端 URL。
- `tool.result.view` 展示原始 result；`awaiting.ask(mode=form).view` 决定模板。`viewError` 表示服务端冻结失败，不重试成另一个版本；保留原结果和表单拒绝入口。
- hash 是服务端在发事件前保存的 Chat 快照。回放和归档继续使用同一 hash，不能把它换成当前模板；客户端不发起无 hash 的连接器请求。

## 展示协议

`ViewEmbed` 发送 `{type:"view_init" | "view_update",data:{view,payload}}`。没有执行或提交消息处理器。`viewDocumentHTML` 只内联声明资源并注入 CSP；所有新 VIEW 使用 `sandbox="allow-scripts"`，不授予同源或宿主桥接权限。应安装可信模板包。

display 文档在 head 最前注入宿主适配脚本 `window.zenmindView`（不属于快照）：`onData((payload, view) => …)` 接收 init/update（晚注册也会收到最近一次数据），`resize()` 手动上报；默认 ResizeObserver 发送 `{type:"view_resize",height}`。`ViewEmbed` 只接受来自自身 iframe 的尺寸消息，限定 48–1600px，首次上报前 320px。表单文档不注入。

### Markdown VIEW 块

助手正文写作 ` ```view key=<connectorId>/<viewKey> `，正文只放一个 JSON 对象或数组。`contentSegments.parseContentSegments` 按逐行语法分段：栅栏须在行首、恰好三个反引号，属性只接受 key，其他代码块内的 view 栅栏保持为代码；VIEW segment 带 `index`（已闭合 VIEW 块序号）、`key`、`payloadRaw`、原始块 `text` 与 `closed`。语法与平台 `internal/view.ParseMarkdownBlocks` 共用 golden 用例 `events/lib/__fixtures__/view_markdown_cases.json`，修改须两边同步。

模板只由平台绑定：`content.view` 与 `content.snapshot.views` 写入内容节点的 `viewBindings[index]`，后续 delta/end 保留。`ContentBlock` 对已绑定块调用 `renderContentView(segment, chatId, binding)`；流式中尚未绑定显示加载中；内容结束仍无绑定（ACP/PROXY、历史旧 JSON 信封）按原始代码块显示；`viewError` 显示错误并可展开原始数据。

## HITL

表单独立于 renderer：`mode: form` 可使用 HTML 或 QLC。宿主发送 `awaiting_init/awaiting_update`（含 `runId/awaitingId`、单个 `form: {title?,data}` 和 view；不发送 `form.id`、`activeFormId` 或 forms 数组）。用户点击同意后发送 `awaiting_collect`，模板响应 `frontend_awaiting_submit`，params 使用原 `{id,decision:"approve",form:{...}}`。

只接受当前 iframe、宿主正在收集且 id 属于当前表单的响应。宿主固定路由，通过原 `/api/submit` 提交；拒绝直接由宿主完成，模板不能自行批准。加载失败不转成默认批准。

Team 外层仍使用汇总 HITL，成员 VIEW 位于 `forms[i].form.view`。宿主为当前成员创建隔离的 frame 数据，只向它发送自己的 forms；收集结果包装到外层对应的 `form.params`，保留其他成员路由。

## 实现与限制

主要实现：`shared/contracts/view.ts`、`shared/data/api/requests/views.ts`、`shared/utils/viewDocument.ts`、`timeline/components/ViewEmbed.tsx`、`tools/lib/viewFrame.ts` 与 `tools/hooks/useAwaitingFrameDocument.ts`。

QLC 当前提供 JSON 展示和 JSON 表单兜底，尚未解释专有控件。资源应预打包，暂不支持 CSS @import、JS 模块依赖解析或远端 CDN。在线回放支持 VIEW，独立会话 HTML 导出不内联模板。旧 `/api/viewport` 与旧 viewport fence 已移除。builtin 来源使用 native 或 HTML；Desktop 与 ACP bridge 同步携带统一 view 引用。

包结构、远端模板协议、凭据、错误码和迁移步骤以相邻 Platform 的 `docs/VIEW连接器.md` 为完整契约。

内置请求使用 `source=builtin&key=...`，无需连接器；连接器使用 `source=connector` 并沿用 Chat/hash 授权。HTTP/WS 同形，source 必填。
