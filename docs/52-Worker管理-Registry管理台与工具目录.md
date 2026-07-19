# Registry管理台与工具目录

## 当前状态
Registry 管理台由 `/registries` 路由进入，管理 providers、models、viewport-servers 和非 MCP tools 目录视图。MCP 连接器及其工具已迁移到独立 `/mcp-servers` 页面。页面主体在 `src/app/pages/registries/index.tsx`。

## 核心职责
- 列出 registry 文件状态、摘要、诊断和更新时间。
- 支持新建、编辑、保存、校验 registry YAML 内容。
- 将 tools 接口结果归一为可搜索的目录视图。
- 展示 provider、model 和 viewport server 等配置类别的数量和状态。

## 核心流程
页面加载后拉取 admin registries 列表摘要，进入 Tools tab 时再加载 tools。registry 列表按分类展示关键字段：provider 显示 key/baseUrl；model 显示 name、provider、protocol、type 与能力图标；viewport server 显示 serverKey/baseUrl。用户选择类别和条目后，详情区域再加载文件内容、完整诊断、来源路径和文件大小为 draft。保存或校验时调用 admin registry API。Tools tab 不编辑文件，只展示 `/api/admin/tools` 中 `sourceCategory` 非 `mcp` 的扁平工具摘要字段。

## 边界与非目标
- Registry 管理台不执行模型请求或 viewport 服务探测。
- Tools tab 是工具目录观察视图，不是 frontend tool 运行容器。
- YAML 字段语义以后端 registry loader 为准。

## 相关文件
- `../src/app/pages/registries/index.tsx`
- `../src/app/pages/registries/index.test.ts`
- `../src/shared/data/api/client.ts`
- `../src/shared/data/api/endpoints.ts`
- `../src/shared/ui/SearchFilterBar.tsx`
- `../src/shared/ui/UiTag.tsx`
