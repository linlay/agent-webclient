# Registry管理台与工具目录

## 当前状态
Registry 管理台由 `/registries` 路由进入，管理 providers、models 和非 MCP tools 目录视图。MCP/CLI/VIEW 连接器及其组件工具位于独立 `/connectors` 页面。`src/app/pages/registries/index.tsx` 只保留页面 `<main>` 和 `RegistryConsole` 装配，领域实现位于 `src/features/registries/`。

## 核心职责
- 列出 registry 文件状态、摘要、诊断和更新时间。
- 支持新建、编辑、保存、校验 registry YAML 内容。
- 供应商和模型的 YAML 编辑区复用本地 Monaco `CodeEditor`，提供语法高亮、行号、代码折叠、两空格缩进和查找替换；明暗配色跟随应用主题，编辑区支持纵向调整高度。切换文件时隔离编辑器与撤销记录，加载或保存期间只读，配置语义仍由后端校验。
- 将 tools 接口结果归一为可搜索的目录视图。
- 展示 provider、model 配置类别的数量和状态。

## 核心流程
`useRegistryConsoleRuntime` 负责列表、详情和 Tool 快照的加载，以及分类切换、新建、校验、保存、错误和脏草稿状态。registry 列表按分类展示关键字段：provider 显示 key/baseUrl；model 显示 name、provider、protocol、type 与能力图标。用户选择类别和条目后，详情区域再加载文件内容、完整诊断、来源路径和文件大小为 draft。Tools tab 不编辑文件，只展示 `/api/admin/tools` 中 `sourceCategory` 非 `mcp` 的扁平工具摘要字段。过滤、默认文件名、模板、详情/列表映射均在 `lib/registryConsole.ts` 中保持为纯逻辑。

## 边界与非目标
- Registry 管理台不执行模型请求。
- Tools tab 是工具目录观察视图，不是 frontend tool 运行容器。
- YAML 字段语义以后端 registry loader 为准。

## 相关文件
- `../src/app/pages/registries/index.tsx`
- `../src/features/registries/components/RegistryConsole.tsx`
- `../src/features/registries/components/RegistryListPane.tsx`
- `../src/features/registries/components/RegistryDetailPane.tsx`
- `../src/features/registries/hooks/useRegistryConsoleRuntime.ts`
- `../src/features/registries/lib/registryConsole.ts`
- `../src/shared/data/api/client.ts`
- `../src/shared/data/api/endpoints.ts`
- `../src/shared/ui/SearchFilterBar.tsx`
- `../src/shared/ui/UiTag.tsx`

旧 `viewport-servers` 不再提供分类、新建或编辑入口，后端若仍返回该兼容类别，列表加载和过滤会排除它。视图统一在 [连接器](53-Worker管理-连接器.md) 的 VIEW 组件中管理；旧 viewport 渲染协议只用于历史兼容。
