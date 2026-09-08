# 连接器管理台

## 页面与接口
设置菜单统一显示“连接器”，主路由为 `/connectors` 和 `/connectors/:connectorId`，旧 `/mcp-servers` 路由保留为页面入口别名。详情使用安装包 id；页面壳负责路由与查询参数适配，领域实现归 `src/features/connectors/`。

- `GET /api/admin/connectors` 读取 `data.connectors[]` 中的清单、CLI/MCP/bin/skills 标识和各 MCP 组件同步状态。
- `GET /api/admin/tools` 读取 MCP 工具摘要，按每个组件的完整 serverKey 精确归属；未匹配工具单独展示。
- `GET /api/admin/connectors/detail?id=...&file=...` 读取已存在的 connector.json、mcp.json、cli.json。
- `PUT /api/admin/connectors/detail` 提交 id、file、content 和必填 baseSha256，完整包校验和 reload 由后端负责。
- `POST /api/admin/connectors/import` 使用 multipart 的 `file` 上传 ZIP，需要覆盖时额外提交 `overwrite=true`；成功读取 `data.id/name/version/installed/authMode`。
- `GET /api/admin/connectors/auth?id=...` 恢复或轮询当前授权状态；`POST` 同地址异步开始登录，`DELETE` 同地址退出并清除此部署的连接器凭据。
- `POST /api/admin/connectors/auth/cancel?id=...` 仅取消当前登录，不等同于退出账号。

旧 MCP Registry YAML 接口与前端实现已移除。页面支持外部连接器 ZIP 导入，不提供删除入口；`builtin` 或 `readOnly` 标记的内置包仅可查看和复制配置，不能保存或通过 ZIP 覆盖。

## 展示与编辑
列表按名称、id、技能和组件 serverKey 搜索。CLI/MCP 筛选依据 hasCli/hasMcp，同一混合包可以出现在两种筛选结果中。概览展示主类型、认证声明、bin、附带技能及 MCP 组件；纯 CLI 包不显示 MCP 同步状态。CLI 的 init/versionCheck/登录声明不会由配置编辑页面执行，包内可执行文件可以随 ZIP 导入。

MCP 组件分别展示 pending/syncing/ready/unavailable/disabled、工具数、同步时间和诊断。unavailable 且存在工具时标记上次成功快照；ready 且 toolCount 为零时明确表示远端返回零工具。serverKey 使用后端返回的完整值，不根据 id 前缀猜测归属。

详情不再重复渲染名称、ID、描述头部。“概览”的基本信息是 connector.json 的唯一编辑入口，支持名称、版本、描述表单和完整 JSON 源码；主类型、ID 与认证声明也在这里展示。“配置”只展示包实际包含的 cli.json/mcp.json；仅有一个组件时不重复展示文件选择按钮。概览与配置由当前文件统一驱动，切换被未保存确认阻止时不会产生标签与编辑文件错位。

MCP 支持每个组件的完整 HTTP URL、stdio 命令与参数、毫秒超时。HTTP URL 不追加隐式 /mcp。JSON 源码可编辑完整定义，包括 CLI、认证声明、环境变量、请求头和 platform 高级字段；表单修改保留其他组件及未展示字段。

表单与源码共用一份草稿。切换文件、离开页面和重新加载时保护未保存修改；保存冲突（409）保留草稿与原始哈希，提示用户复制修改后重新加载并合并。校验或保存失败同样保留草稿。后端是包配置合法性的最终校验方。

## 账号授权
现有详情页概览中的“账号授权”区域按清单中的 `auth_mode` 决定交互：`cli/oauth/mcp` 使用统一登录 API，`none` 显示无需授权，`token` 引导到现有配置页。前端不根据连接器 id 分支，不执行 CLI 或安装命令；实际认证声明、依赖准备、OAuth 发现及凭据保管均由后端从 cli.json/mcp.json 和清单解释。

首次进入读取服务端会话，展示 not_required/setup_required/unauthorized/preparing/pending/authorized/failed/canceled。preparing/pending 每次响应后等待 2 秒再检查；网络错误退避至 5 秒，401/403/404/405 停止自动重试并展示身份、权限或版本诊断。请求 20 秒超时后可重新检查。sessionId 为空及 expiresAt 的零时间不会误判过期；有效期限到达时禁止打开旧链接，显示过期和重试入口。重试仍活动的过期会话会先取消，再发起新登录。

pending 时展示后端返回的“打开授权页面”链接，只接受无用户名密码的显式 HTTP(S) URL，使用新页面、noopener/noreferrer 与 no-referrer。入口由用户直接点击，避免依赖异步自动弹窗；链接会保留供浏览器拦截后手动再次打开。页面仅在后端返回 authorized 后显示成功，扫码、打开链接或时间到达均不代表授权完成。

操作使用同步请求锁避免重复提交；取消或退出会使旧轮询结果失效。离开组件或切换连接器时取消浏览器请求并清理定时器，不向后端发送取消或退出；重新进入可恢复当前服务端会话。所有授权请求使用现有 Platform API 身份客户端和 `{code,msg,data}`，设置 `cache: no-store`，不进入查询缓存、localStorage、sessionStorage 或导出；列表只保留当前页面内观察到的状态标签。

授权变化后刷新目录、详情中的 MCP 元数据和工具快照，不重载配置草稿。登录成功与 MCP tools/list 同步就绪分别展示。账号授权按部署共享，退出前需在页面内确认影响范围。OAuth/MCP 回调要求浏览器与 Platform 在同一台机器，当前不支持远程浏览器回调。联调需要运行带上述接口的 Platform 版本及有效平台身份，旧服务需要更新并重启；真实扫码或账号确认由用户完成。

## ZIP 导入
目录工具栏提供“导入 ZIP”，支持选择或拖入单个文件。前端检查 ZIP 扩展名、非空和 64 MiB 上传上限；完整包结构、解压大小、路径安全和 manifest 校验交由后端。ZIP 可以直接包含 connector.json，也可以使用与包 id 一致的单层目录，按需携带 cli.json、mcp.json、bin 和 skills。

首次上传不覆盖已安装包。仅当后端返回 `409 connector_exists` 时展示覆盖警告，用户再次点击“确认覆盖导入”后才发送 `overwrite=true`；更换文件清除覆盖状态。413 显示服务器大小限制提示，内置包覆盖错误显示只读说明，其他错误展示后端诊断并保留所选文件。

存在未保存配置时，导入前确认丢弃；取消或请求失败保留原草稿。上传期间禁止重复提交、关闭弹窗、切换连接器和保存配置。成功后刷新目录、清除搜索筛选并选中返回的 id；目录刷新失败单独展示加载错误，不把已完成安装报告为导入失败。

## 实时刷新
首次加载、手工刷新和保存后刷新目录与工具快照；订阅 `catalog.updated(reason=connectors|config)` 并在页面可见时每 5 秒轮询兜底。后台刷新不重载编辑内容；列表与详情均忽略过期请求结果，防止切换连接器后的迟到响应覆盖当前配置。

## 主要代码
- `src/app/pages/connectors/index.tsx`
- `src/features/connectors/components/ConnectorsConsole.tsx`
- `src/features/connectors/components/ConnectorConfigEditor.tsx`
- `src/features/connectors/components/ConnectorOverview.tsx`
- `src/features/connectors/components/ConnectorImportModal.tsx`
- `src/features/connectors/components/ConnectorAuthPanel.tsx`
- `src/features/connectors/hooks/useConnectorsRuntime.ts`
- `src/features/connectors/hooks/useConnectorImport.ts`
- `src/features/connectors/hooks/useConnectorAuth.ts`
- `src/features/connectors/lib/connectorAuth.ts`
- `src/shared/data/api/dto/connectors.ts`
- `src/shared/data/api/requests/connectors.ts`
