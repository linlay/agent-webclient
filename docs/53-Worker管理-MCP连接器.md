# MCP连接器管理台

## 当前状态
MCP 连接器管理台由 `/mcp-servers` 进入，并通过 `/mcp-servers/:serverKey` 支持连接器详情直达。页面主体位于 `src/app/pages/mcp-servers/index.tsx`。

## 核心职责
- 只管理 `mcp-servers` registry 配置，支持新建、校验、保存和刷新。
- 默认通过结构化表单编辑配置，并提供独立的 YAML“源码编辑”入口。
- 通过吸顶锚点栏导航基本属性、连接配置、同步策略、概览和工具区域，并跟随内容滚动高亮当前区域。
- 按工具摘要的 `sourceCategory=mcp` 与精确 `serverKey` 建立归属关系。
- 集中展示缺少 serverKey 或引用不存在连接器的未归属工具。

## 核心流程
页面首次加载、切换连接器、保存和手工刷新时并行读取 `/api/admin/registries` 与 `/api/admin/tools`，前者只保留 `mcp-servers`，后者只保留 MCP 来源工具。加载连接器源码后，页面通过 registry validate 接口取得解析后的配置并初始化结构化表单；YAML 语法无法解析时自动进入源码编辑，修复并保存后才恢复配置编辑。页面订阅 `catalog.updated(reason=mcp-servers|config)` 自动刷新 catalog，并在页面可见时以 5 秒只读轮询兜底；后台刷新只更新连接器摘要和工具快照，不覆盖未保存的结构化表单或 YAML 草稿。基础路由默认展示第一个连接器，详情路由按 `summary.serverKey`、key、name、文件名依次解析稳定路由键。列表选择会更新详情 URL，并保留当前语言和主题查询参数。

配置编辑覆盖 HTTP/stdio 传输、启停、工具前缀、连接参数、认证、请求头/环境变量、超时、重试和工具别名。HTTP 的 `baseUrl` 与 `endpointPath` 分开输入，并实时展示最终连接地址，避免把 `/mcp` 同时写进两处。结构化保存会规范化这些字段，同时保留源码中的 `tools` 和其他未在表单展示的高级字段；源码编辑用于直接修改完整 YAML。两种模式切换时如果存在未保存修改会要求确认，避免静默丢失草稿。新建连接器在结构化保存时按 `serverKey` 生成对应 YAML 文件名，并阻止覆盖同名配置。

概览分别展示 YAML 状态与 `pending/syncing/ready/unavailable/disabled` 工具同步状态、服务地址、配置文件、同步时间和数量；工具区只展示 serverKey 精确匹配的工具。临时不可用时保留并标记上次成功快照，`ready` 且为空时明确表示远端返回 0 个工具；配置校验复用 registry validate 接口。缺少 serverKey 或引用未知连接器的工具进入“未归属工具”视图。

## 边界与非目标
- 页面不直接调用 MCP 工具。
- 页面支持带二次确认的连接器删除；删除成功时后端已完成 registry reload 和工具快照清理，页面自动选中相邻连接器。页面不主动发起连接测试或重连，也不提供工具编辑能力；重连由后端 availability gate/reconnect loop 负责。
- Registry YAML 字段语义和 watcher 生效机制以后端实现为准。

## 相关文件
- `../src/app/pages/mcp-servers/index.tsx`
- `../src/features/registries/lib/mcpRegistry.ts`
- `../src/features/registries/lib/mcpServerForm.ts`
- `../src/shared/data/api/client.ts`
