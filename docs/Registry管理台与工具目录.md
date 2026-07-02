# Registry管理台与工具目录

## 当前状态
Registry 管理台由 `/registries` 路由进入，管理 providers、models、mcp-servers、viewport-servers 和 tools 目录视图。页面主体在 `src/app/pages/registries/index.tsx`。

## 核心职责
- 列出 registry 文件状态、摘要、诊断和更新时间。
- 支持新建、编辑、保存、校验 registry YAML 内容。
- 将 tools 接口结果归一为可搜索的目录视图。
- 展示 provider/model/MCP/viewport server 等配置类别的数量和状态。

## 核心流程
页面加载后拉取 admin registries 列表摘要和 tools。registry 列表按分类展示关键字段：provider 显示 key/baseUrl；model 显示 name、provider、protocol、type 与能力图标；MCP server 显示 serverKey/baseUrl 和当前已同步工具数，选中后在详情区追加只读工具列表；viewport server 显示 serverKey/baseUrl，不显示 viewport 数量。用户选择类别和条目后，详情区域再加载文件内容、完整诊断、来源路径和文件大小为 draft。保存或校验时调用 admin registry API。Tools tab 不编辑文件，只展示 `/api/admin/tools` 的扁平工具摘要字段（key/name/kind/sourceType/sourceCategory/serverKey），不读取内部 meta。

## 边界与非目标
- Registry 管理台不执行模型请求、MCP 调用或 viewport 服务探测。
- Tools tab 是工具目录观察视图，不是 frontend tool 运行容器。
- YAML 字段语义以后端 registry loader 为准。

## 相关文件
- `../src/app/pages/registries/index.tsx`
- `../src/app/pages/registries/index.test.ts`
- `../src/shared/data/client.ts`
- `../src/shared/data/endpoints.ts`
- `../src/shared/ui/SearchFilterBar.tsx`
- `../src/shared/ui/UiTag.tsx`
