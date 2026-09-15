# Registry管理台与工具目录

## 当前状态
Registry 管理台由 `/registries` 路由进入，管理 providers、models 和非 MCP tools 目录视图。MCP/CLI/VIEW 连接器及其组件工具位于独立 `/connectors` 页面。`src/app/pages/registries/index.tsx` 只保留页面 `<main>` 和 `RegistryConsole` 装配，领域实现位于 `src/features/registries/`。

## 核心职责
- 列出 registry 文件状态、摘要、诊断和更新时间。
- 支持新建、编辑、保存、校验 registry YAML 内容。
- 供应商和模型的 YAML 编辑区复用本地 Monaco `CodeEditor`，提供语法高亮、行号、代码折叠、两空格缩进和查找替换；明暗配色跟随应用主题，编辑区支持纵向调整高度。切换文件时隔离编辑器与撤销记录，加载或保存期间只读，配置语义仍由后端校验。
- 将 tools 接口结果归一为可搜索的目录视图。
- 展示 provider、model 配置类别的数量和状态。
- 供应商和模型列表的名称前展示本地 SVG，仅按 YAML 的 `icon` 标识（由后端通过 `summary.icon` 透传）查找；未配置或标识未知时统一使用 `default`，不根据名称、modelId、key 或供应商猜测。支持 `bge`、`chatgpt`、`claude`、`deepseek`、`default`、`gemini`、`glm`、`grok`、`kimi`、`minimax`、`mimo`、`qwen`、`step`；新建模板使用 `icon: default`。单色图标适配暗色主题，彩色图标保留原色；模型菜单遵循同一规则。

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

## 对话辅助入口

手工创建、编辑、保存与对话方式并存。独立的「通过对话创建／修改」入口使用默认 Chat 智能体，预选 `platform-admin` 并填写草稿，不自动发送。保留原有表单、源码编辑、ZIP 导入及只读边界；连接器手工新增沿用 ZIP 导入。详见[资源对话创建与修改](01-应用基础-应用入口路由与布局壳层.md#资源对话创建与修改)。
