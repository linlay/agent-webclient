# VIEW 连接器

连接器管理界面并列提供 MCP / CLI / VIEW，组件文件为 `mcp.json/cli.json/view.json`，支持混合包。VIEW 负责展示，数据查询与执行继续由 Tool/MCP/CLI 承担。

## 数据接入

- `GET /api/view` 和同名 WS route 接受 `chatId/connectorId/key/hash?/usage?`，usage 为 `display | form`。沿用统一响应包裹与鉴权。
- data 为 `{view,entry?,html?,qlc?,assets?}`；view 含 `connectorId/key/version/hash/renderer`，asset 含 `path/mediaType/data(base64)`。客户端不提供 Agent、路径或远端 URL。
- `tool.result.view` 展示原始 result；`awaiting.ask(mode=form).view` 决定模板。`viewError` 表示服务端冻结失败，不重试成另一个版本；保留原结果和表单拒绝入口。
- hash 是服务端在发事件前保存的 Chat 快照。回放和归档继续使用同一 hash，不能把它换成当前模板；Team 必须有 hash。

## 展示协议

`ViewEmbed` 发送 `{type:"view_init" | "view_update",data:{view,payload}}`。没有执行或提交消息处理器。`viewDocumentHTML` 只内联声明资源并注入 CSP；所有新 VIEW 使用 `sandbox="allow-scripts"`，不授予同源或宿主桥接权限。应安装可信模板包。

Markdown 支持完整 `view` fence，JSON 内容为 `{"view":{"connectorId":"crm","key":"card","hash":"<snapshot>"},"payload":{}}`。普通 Agent 可省略 hash，此时读取当前挂载，Markdown 原文不回写 hash；需要固定历史时必须显式保存 hash。Team 不允许无 hash。

## HITL

表单独立于 renderer：`mode: form` 可使用 HTML 或 QLC。宿主发送 `awaiting_init/awaiting_update`（含原 `runId/awaitingId/forms/form/activeFormId` 和 view）。用户点击同意后发送 `awaiting_collect`，模板响应 `frontend_awaiting_submit`，params 使用原 `{id,decision:"approve",form:{...}}`。

只接受当前 iframe、宿主正在收集且 id 属于当前表单的响应。宿主固定路由，通过原 `/api/submit` 提交；拒绝直接由宿主完成，模板不能自行批准。加载失败不转成默认批准。

Team 外层仍使用汇总 HITL，成员 VIEW 位于 `forms[i].form.view`。宿主为当前成员创建隔离的 frame 数据，只向它发送自己的 forms；收集结果包装到外层对应的 `form.params`，保留其他成员路由。

## 实现与限制

主要实现：`shared/contracts/view.ts`、`shared/data/api/requests/views.ts`、`shared/utils/viewDocument.ts`、`timeline/components/ViewEmbed.tsx`、`tools/components/viewFrame.ts` 与 `useAwaitingFrameDocument.ts`。

QLC 当前提供 JSON 展示和 JSON 表单兜底，尚未解释专有控件。资源应预打包，暂不支持 CSS @import、JS 模块依赖解析或远端 CDN。在线回放支持 VIEW，独立会话 HTML 导出不内联模板。旧 `/api/viewport`、旧 viewport fence、builtin 对话框继续兼容。Desktop bridge 镜像未改变。

包结构、远端模板协议、凭据、错误码和迁移步骤以相邻 Platform 的 `docs/VIEW连接器.md` 为完整契约。
