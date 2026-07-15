# API端点注册与DTO

## 当前状态
接口端点集中注册在 `src/shared/data/api/endpoints.ts`，DTO 和 HTTP client helper 主要在 `src/shared/data/api/client.ts`。端点声明包含 key、path、method、transport、cache 和 payload 构造函数。

## 核心职责
- 统一维护 `/api/*`、`/ws`、`/api/voice/*`、`/api/resource` 等前端消费入口。
- 为 agent、team、chat、archive、automation、memory、registry、run、voice、resource 等接口提供类型。
- 通过 `defineEndpoint` 和 `createEndpointRegistry` 保持端点声明可检索。
- 为上传、下载、资源文本读取和 viewport 读取提供专门 helper。

## 核心流程
业务模块从 `src/shared/data` 导入具体函数，不直接拼接 URL。新增接口时先在 `endpoints.ts` 注册端点，再在 `client.ts` 或 `routedClient.ts` 暴露语义化函数，最后由 feature hook 或页面调用。

`runs.btw` 固定注册为 `POST /api/btw` 的 SSE 端点。其 DTO 只发送父 `chatId`、可选 `btwId` 和 query 参数，不发送 agent/team/planning 路由字段；这些身份由后端从父会话继承。

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

后端按每个项首条最近 chat 的 `lastRunId` 将 Agent 与 Team 混排；`chats[0]` 即该 worker 的最近会话。前端不解析不透明的 run ID，而是保留响应顺序，并在嵌套 chat 未给出身份时按父项补齐 `agentKey` 或 `teamId`。`runtimeMode: "orchestrated"` 或 `meta.orchestrated: true` 可用于 Team UI 语义；Team 成员用于展示与内部委派，不能成为外层会话的执行 Agent。

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
