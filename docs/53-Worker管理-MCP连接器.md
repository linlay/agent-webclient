# MCP连接器管理台

## 当前状态
MCP 连接器管理台由 `/mcp-servers` 进入，并通过 `/mcp-servers/:serverKey` 支持连接器详情直达。页面主体位于 `src/app/pages/mcp-servers/index.tsx`。

## 核心职责
- 只管理 `mcp-servers` registry YAML 配置，支持新建、校验、保存和刷新。
- 在连接器详情中分开展示概览、所属工具和 YAML 配置。
- 按工具摘要的 `sourceCategory=mcp` 与精确 `serverKey` 建立归属关系。
- 集中展示缺少 serverKey 或引用不存在连接器的未归属工具。

## 核心流程
页面并行读取 `/api/admin/registries` 与 `/api/admin/tools`，前者只保留 `mcp-servers`，后者只保留 MCP 来源工具。基础路由默认展示第一个连接器，详情路由按 `summary.serverKey`、key、name、文件名依次解析稳定路由键。列表选择会更新详情 URL，并保留当前语言和主题查询参数。

连接器详情按概览、工具、配置顺序纵向平铺：概览展示状态、服务地址、配置文件、更新时间、工具同步数量、诊断和摘要；工具区只展示 serverKey 精确匹配的工具；配置区复用 admin registry detail/validate/save 接口。缺少 serverKey 或引用未知连接器的工具进入“未归属工具”视图。

## 边界与非目标
- 页面不直接调用 MCP 工具。
- 页面不提供后端尚未支持的连接测试、重连、删除或工具编辑能力。
- Registry YAML 字段语义和 watcher 生效机制以后端实现为准。

## 相关文件
- `../src/app/pages/mcp-servers/index.tsx`
- `../src/features/registries/lib/mcpRegistry.ts`
- `../src/shared/data/api/client.ts`
