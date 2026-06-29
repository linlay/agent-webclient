# API端点注册与DTO

## 当前状态
接口端点集中注册在 `src/shared/data/endpoints.ts`，DTO 和 HTTP client helper 主要在 `src/shared/data/client.ts`。端点声明包含 key、path、method、transport、cache 和 payload 构造函数。

## 核心职责
- 统一维护 `/api/*`、`/ws`、`/api/voice/*`、`/api/resource` 等前端消费入口。
- 为 agent、team、chat、archive、automation、memory、registry、run、voice、resource 等接口提供类型。
- 通过 `defineEndpoint` 和 `createEndpointRegistry` 保持端点声明可检索。
- 为上传、下载、资源文本读取和 viewport 读取提供专门 helper。

## 核心流程
业务模块从 `src/shared/data` 导入具体函数，不直接拼接 URL。新增接口时先在 `endpoints.ts` 注册端点，再在 `client.ts` 或 `routedClient.ts` 暴露语义化函数，最后由 feature hook 或页面调用。

## 边界与非目标
- `endpoints.ts` 是前端消费清单，不等于后端 OpenAPI 定义。
- DTO 应贴近前端实际读取字段，避免为未使用字段建立庞大类型。
- 管理页和对话页复用同一数据层，不在组件里重复封装 fetch。

## 相关文件
- `../src/shared/data/endpointRegistry.ts`
- `../src/shared/data/endpoints.ts`
- `../src/shared/data/client.ts`
- `../src/shared/data/index.ts`
- `../src/shared/data/client.test.ts`

