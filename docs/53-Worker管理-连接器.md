# 连接器管理台

## 页面与接口
设置菜单统一显示“连接器”，主路由为 `/connectors` 和 `/connectors/:connectorId`，旧 `/mcp-servers` 路由保留为页面入口别名。详情使用安装包 id；页面壳负责路由与查询参数适配，领域实现归 `src/features/connectors/`。

- `GET /api/admin/connectors` 读取 `data.connectors[]` 中的清单、CLI/MCP/bin/skills 标识和各 MCP 组件同步状态。
- `GET /api/admin/tools` 读取 MCP 工具摘要，按每个组件的完整 serverKey 精确归属；未匹配工具单独展示。
- `GET /api/admin/connectors/detail?id=...&file=...` 读取已存在的 connector.json、mcp.json、cli.json。
- `PUT /api/admin/connectors/detail` 提交 id、file、content 和必填 baseSha256，完整包校验和 reload 由后端负责。

旧 MCP Registry YAML 接口与前端实现已移除。连接器安装、删除、上传和认证生命周期没有对应的后端管理 API，界面只提供已安装包的查看和配置编辑。

## 展示与编辑
列表按名称、id、技能和组件 serverKey 搜索。CLI/MCP 筛选依据 hasCli/hasMcp，同一混合包可以出现在两种筛选结果中。概览展示主类型、认证声明、bin、附带技能及 MCP 组件；纯 CLI 包不显示 MCP 同步状态。CLI 的 init/versionCheck/登录声明不会由页面执行，包内可执行文件需由部署流程准备。

MCP 组件分别展示 pending/syncing/ready/unavailable/disabled、工具数、同步时间和诊断。unavailable 且存在工具时标记上次成功快照；ready 且 toolCount 为零时明确表示远端返回零工具。serverKey 使用后端返回的完整值，不根据 id 前缀猜测归属。

配置文件按包实际组件显示。清单支持名称、版本、描述表单；MCP 支持每个组件的完整 HTTP URL、stdio 命令与参数、毫秒超时。HTTP URL 不追加隐式 /mcp。JSON 源码可编辑完整定义，包括 CLI、认证声明、环境变量、请求头和 platform 高级字段；表单修改保留其他组件及未展示字段。

表单与源码共用一份草稿。切换文件、离开页面和重新加载时保护未保存修改；保存冲突（409）保留草稿与原始哈希，提示用户复制修改后重新加载并合并。校验或保存失败同样保留草稿。后端是包配置合法性的最终校验方。

## 实时刷新
首次加载、手工刷新和保存后刷新目录与工具快照；订阅 `catalog.updated(reason=connectors|config)` 并在页面可见时每 5 秒轮询兜底。后台刷新不重载编辑内容；列表与详情均忽略过期请求结果，防止切换连接器后的迟到响应覆盖当前配置。

## 主要代码
- `src/app/pages/connectors/index.tsx`
- `src/features/connectors/components/ConnectorsConsole.tsx`
- `src/features/connectors/components/ConnectorConfigEditor.tsx`
- `src/features/connectors/components/ConnectorOverview.tsx`
- `src/features/connectors/hooks/useConnectorsRuntime.ts`
- `src/shared/data/api/dto/connectors.ts`
- `src/shared/data/api/requests/connectors.ts`
