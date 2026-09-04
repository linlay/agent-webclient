# API端点注册与DTO

## 当前状态
接口端点集中注册在 `src/shared/data/api/endpoints.ts`，DTO 和 HTTP client helper 主要在 `src/shared/data/api/client.ts`。端点声明包含 key、path、method、transport、wsBackends、cache 和 payload 构造函数；所有 `auto` 端点必须显式声明支持 WS 的 backend。

## 核心职责
- 统一维护 `/api/*`、`/ws`、`/api/voice/*`、`/api/resource` 等前端消费入口。
- 为 agent、team、chat、archive、automation、memory、registry、run、voice、resource 等接口提供类型。
- 通过 `defineEndpoint` 和 `createEndpointRegistry` 保持端点声明可检索。
- 为上传、下载、资源文本读取和 viewport 读取提供专门 helper。

## 核心流程
普通数据业务从 `src/shared/data` 导入语义化函数，不直接拼接 URL。Run 生命周期由 `RunTransport` 使用 `endpoints.ts` 的 payload builder 和端点定义统一发送；管理源文件通过 Admin Source 读写，语音能力与 voice 列表通过 flexible voice helper 读取。

`ChatDetailResponse` 继承完整 `ChatSummaryResponse`：`/api/chat` 除 replay 数据外必须提供 `agentKey`/`teamId`、`lastRunId`、`lastRunContent` 与 `read { isRead, readAt?, readRunId? }`。`markChatRead` 是 WebClient Main Chat 的单 Chat read 请求函数；Desktop 模式仍通过通用 Frame Port `/api/read` 转发，Desktop 宿主不暴露或调用单 Chat read 业务 IPC。Agent 级批量已读属于宿主的显式用户命令，不由 WebClient 的自动 read hook 代发。

Agent 顺序有两条 HTTP-only 数据边界：普通客户端通过 `GET/PUT /api/agents/order` 读取和提交全部有效 runtime Agent 的 catalog 顺序；Agent 管理台从 `/api/admin/agents` 的列表顺序初始化，并通过 `PUT /api/admin/agents/order` 提交包含 invalid Agent 的完整 admin 顺序。两者复用 `AgentOrderResponse { version, order, updatedAt? }`，其中未生成顺序文件时 `updatedAt` 可以省略；前端不把 public endpoint 注册为 WebSocket route，也不把管理台切到 public mutation。

静态 HTML 导出并行请求 `GET /api/chat/export?chatId=...&format=snapshot` 与同源 `/export/conversation.template.html`。Snapshot 保持 Blob，service 层只解析小体积模板并用 Blob parts 组装完整文档；Platform 不提供 HTML 格式。`src/shared/data/conversationSharePath.ts` 只负责将事件中的合法 `shareId` 构造成 `/share/{id}` 路径，不发起匿名请求，也不读取运行时配置。

Chat 资源使用两层协议：后端新工具结果与 Markdown 提供不含 `chatId` 的 `<relativePath>` ChatScope 引用，前端统一通过 `classifyResourceUrl` 分类，并由 `URLSearchParams` 转换为 `GET /api/resource?file=<chatId>/<relativePath>`。POSIX 绝对路径转换为 `GET /api/resource?chatId=<chatId>&file=<absolutePath>`，其中 `/tmp/...` 与 Team Chat 都走同一请求分支，是否允许由 Platform 判定。HTTP(S)、`data:`、`blob:` 直接使用且不接收平台 Bearer；同源 `/api/resource`、`file://`、Windows/UNC、当前 chatId 前缀、query/fragment、反斜线、空段、`.`/`..` 与编码后路径分隔符都作为 URL 结构非法而不发起 fetch。`downloadResource`、`getResourceText`、`getResourceBlob` 只对 ChatScope 和结构合法的绝对路径使用 Bearer/Cookie，组件不手工拼接真实资源请求。

`RunTransport.startBtw` 通过 Platform stream 向 `/api/btw` 发起 BTW Run。其 DTO 只发送父 `chatId`、可选 `btwId` 和 query 参数，不发送 agent/team/planning 路由字段；这些身份由后端从父对话继承。

对话页通过 `GET /api/skills?agentKey=...` 读取 `AgentSkillsResponse`，每项只消费 `key/name/description/agentHasSkill`。该端点注册为 Platform-only `auto`：Platform 模式向 `/api/skills` 发送 `{agentKey}` request frame，Gateway 因未暴露该 WS route 而在请求前选择 HTTP；WS 连接或传输故障不回退 HTTP。结果按 Agent 缓存 30 秒并合并并发读取。该只读目录接口与 `/api/admin/skills` 管理接口职责分离。

## Skills 管理契约

Skills 管理接口使用 `/api/admin/skills/*` 的 manifest 与文件操作契约。列表和详情返回 `AdminSkillSummary`、`AdminSkillDetailResponse`；文本内容通过 `getAdminSource`、`updateAdminSource` 读写，创建文件/目录、重命名、删除、上传、下载、校验、创建和 ZIP 导入使用对应的 `AdminSkill*` DTO 与语义化 client 函数。完整 ZIP 通过 `importAdminSkill` 以 multipart `key/file` 发送到 `POST /api/admin/skills/import`，成功后复用 `AdminSkillDetailResponse` 并直接进入新技能；409 重名和 422 文件级诊断留在新建弹窗中处理。

后端只在发现 `skills-center/<skill-id>/assets/<skill-id>.png` 时返回可直接访问的可选 `icon` URL；未发现则省略该字段。Skills 列表直接使用该 URL，字段为空或图片加载失败时回退到前端静态资源 `/default-skill.png`。

## Agent 管理导入契约

完整 Agent ZIP 使用 HTTP-only 端点 `POST /api/admin/agents/import`。`importAdminAgent` 接收 `ImportAgentArchiveRequest { file, overwrite? }` 并发送 multipart：`file` 必填，只有用户确认整目录覆盖后才附加字符串 `overwrite=true`；不得发送 `key` 或 `agentKey`。成功复用 `AdminAgentDetailResponse`，前端读取 `key`、`status` 和 `diagnostics` 完成列表刷新、选中与 ready/invalid 提示。

409 覆盖冲突从 `data.error` 读取 `agentKey`、`existingName` 和 `overwriteRequired:true`；只有满足这份明确契约才展示覆盖确认并用同一 `File` 重试。422 的 `diagnostics[]` 使用 `AdminAgentDiagnostic` 展示 `sourcePath/message`；413、415 和其他错误沿用统一 `ApiError` 消息。该端点不进入 WebSocket/routed client，也不由前端解析 ZIP 中的 YAML。

## 对话运行身份

前端内部以 `RunOwner` 表示对话和 run 的公开请求身份，只有两种互斥情况：

- Agent：`{ kind: "agent", agentKey }`
- 编排 Team：`{ kind: "orchestrated-team", teamId }`

`buildQueryPayload`、attach、submit、steer、interrupt、access-level 和 WebSocket 的同类请求都通过同一个 owner 序列化器生成 payload。Agent 只发送 `agentKey`；Team 只发送 `teamId`，payload 绝不包含 `agentKey`。`owner` 仅是前端内部状态，不能作为 API 字段发送。

已保存 chat 的 owner 优先于 run/session 临时身份和流式成员事件。旧 chat 即使同时保存 `teamId` 与 `agentKey`，也会归一化为 Team owner 并丢弃该 `agentKey` 的路由语义。所有 Team 均按编排 Team 处理，不保留 legacy Team 请求分支。

## Agent / Team 混合列表协议

左侧导航通过 `GET /api/agents?includeTeam=true` 获取唯一的 worker 列表；当前 transport 为 WebSocket 时，向 `/api/agents` 发送字段完全相同的 payload。响应 `data` 是按后端顺序排列的扁平数组，每一项必须带 `kind`：

- `kind: "agent"`：保留既有 Agent 字段，可带最近 `chats`。
- `kind: "team"`：使用 `teamId` 作为身份，带 name、role、成员与 icon 等展示字段；可带 `stats.totalCount`、`stats.unreadCount` 和最近 `chats`。

后端按每个项首条最近 chat 的 `lastRunId` 将 Agent 与 Team 混排；`chats[0]` 即该 worker 的最近对话。前端不解析不透明的 run ID，而是保留响应顺序，并在嵌套 chat 未给出身份时按父项补齐 `agentKey` 或 `teamId`。`runtimeMode: "orchestrated"` 或 `meta.orchestrated: true` 可用于 Team UI 语义；Team 成员用于展示与内部委派，不能成为外层对话的执行 Agent。

`scope` 和 `mode` 只过滤 Agent，Team 不受这两个条件影响。`GET /api/chats?mode=...` 与对应 WS `/api/chats` payload 也必须始终保留 Team-owned chat；前端不会因 `teamId` 丢弃它们。

## 边界与非目标
- `endpoints.ts` 是前端消费清单，不等于后端 OpenAPI 定义。
- DTO 应贴近前端实际读取字段，避免为未使用字段建立庞大类型。
- 管理页和对话页复用同一数据层，不在组件里重复封装 fetch。

## 相关文件
- `../src/shared/data/api/endpointRegistry.ts`
- `../src/shared/data/api/endpoints.ts`
- `../src/shared/data/api/client.ts`
- `../src/shared/data/index.ts`
- `../src/shared/data/api/client.test.ts`
- `../src/shared/data/api/endpoints.test.ts`
- `../src/shared/data/conversationSharePath.ts`
