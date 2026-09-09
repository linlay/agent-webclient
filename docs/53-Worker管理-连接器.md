# 连接器管理台

## 页面与接口
设置菜单统一显示“连接器”，主路由为 `/connectors` 和 `/connectors/:connectorId`，旧 `/mcp-servers` 路由保留为页面入口别名。详情使用安装包 id；页面壳负责路由与查询参数适配，领域实现归 `src/features/connectors/`。

- `GET /api/admin/connectors` 读取 `data.connectors[]` 中的清单、CLI/MCP/bin/skills 标识和各 MCP 组件同步状态。
- `GET /api/admin/tools` 读取 MCP 工具摘要，按每个组件的完整 serverKey 精确归属；未匹配工具单独展示。工具名称优先使用 mcpToolName，不重复展示内部调用 key；旧响应仅去除已知的 mcp_<16 位十六进制>_ 前缀，实际调用标识保持不变。超过 8 个工具时提供名称与描述搜索。
- `GET /api/admin/connectors/detail?id=...&file=...` 读取已存在的 connector.json、mcp.json、cli.json。
- `GET /api/admin/connectors/skills?id=...` 读取指定原包的技能名称、描述、版本、触发词、文档相对路径、大小和更新时间。
- `GET /api/admin/connectors/skills/detail?id=...&name=...` 读取包内指定技能的上述元数据及完整 SKILL.md、sha256；不使用技能中心或运行时的 Skill 接口。
- `PUT /api/admin/connectors/detail` 提交 id、file、content 和必填 baseSha256，完整包校验和 reload 由后端负责。
- `POST /api/admin/connectors/import` 使用 multipart 的 `file` 上传 ZIP，需要覆盖时额外提交 `overwrite=true`；成功读取 `data.id/name/version/installed/authMode`。
- `GET /api/admin/connectors/auth?id=...` 恢复或轮询当前授权状态；`POST` 同地址异步开始登录，`DELETE` 同地址退出并清除此部署的连接器凭据。
- `POST /api/admin/connectors/auth/cancel?id=...` 仅取消当前登录，不等同于退出账号。

旧 MCP Registry YAML 接口与前端实现已移除。页面支持外部连接器 ZIP 导入，不提供删除入口；`builtin` 或 `readOnly` 标记的内置包仅可查看和复制配置，不能保存或通过 ZIP 覆盖。

## 展示与编辑
列表按名称、id、技能和组件 serverKey 搜索。搜索框复用 /registries 的 SearchFilterBar，输入框右侧筛选菜单提供全部、MCP、CLI、VIEW；非全部筛选时高亮入口。组件筛选依据 hasMcp/hasCli/hasView，同一混合包可以出现在多种筛选结果中。管理列表和详情页签旁使用目录返回的 iconUrl 展示品牌图标；缺失、HTTP 失败或图片解码失败时回退 hub。图标通过带鉴权的 HTTP Blob 请求读取 /api/connectors/icon，不把凭据放在 URL，也不把 SVG 插入 DOM；URL 随版本变化后重新加载，切换或卸载时取消请求并释放 Blob URL。connector.json 的 icon 包内路径由表单编辑保留，也可在 JSON 源码中修改。

列表不显示 ID：首行名称与版本两端对齐，底行左侧显示授权状态或同步失败，右侧显示 CLI/MCP 类型。目录加载完成后自动逐项异步检查授权，首次显示“检查中”，不依赖点击；检查失败时明确提示并保留上次已知状态。布局参考技能管理台，以标题和间距分组，减少嵌套边框。

详情分为“概览 / 配置 / 技能（数量）”。概览保留基本信息与账号授权，配置展示 CLI/bin 说明、MCP 组件、工具及同步状态；CLI 的 init/versionCheck/登录声明不会由配置编辑页面执行，包内可执行文件可以随 ZIP 导入。

MCP 组件分别展示 unmounted/pending/syncing/ready/unavailable/disabled、工具数、同步时间和诊断。未挂载组件提示挂载到 Agent 后同步；unavailable 且存在工具时标记上次成功快照；ready 且 toolCount 为零时明确表示远端返回零工具。serverKey 使用后端返回的完整值，不根据 id 前缀猜测归属。

详情不再重复渲染名称、ID、描述头部。“概览”的基本信息是 connector.json 的唯一编辑入口，支持名称、版本、描述表单和完整 JSON 源码；主类型、ID 与认证声明也在这里展示。“配置”只展示包实际包含的 cli.json/mcp.json；仅有一个组件时不重复展示文件选择按钮。概览与配置由当前文件统一驱动，切换被未保存确认阻止时不会产生标签与编辑文件错位。

基本信息顶部按 ID、主类型、认证方式排列三个只读 Input；下一行展示名称和版本，描述独占一行。内置或只读连接器的全部字段保持只读，外部连接器保留名称、版本和描述的编辑与保存能力。

MCP 支持每个组件的完整 HTTP URL、stdio 命令与参数、毫秒超时。HTTP URL 不追加隐式 /mcp。JSON 源码可编辑完整定义，包括 CLI、认证声明、环境变量、请求头和 platform 高级字段；表单修改保留其他组件及未展示字段。

所有 JSON 配置源码统一复用 Monaco CodeEditor，包括 connector.json、cli.json、mcp.json 与 view.json。支持 JSON 高亮、行号、折叠和查找，跟随页面主题；内置配置及保存期间只读，仍可查看和复制。编辑器模型按连接器 ID 和配置文件隔离。

表单与源码共用一份草稿。切换文件、离开页面和重新加载时保护未保存修改；保存冲突（409）保留草稿与原始哈希，提示用户复制修改后重新加载并合并。校验或保存失败同样保留草稿。后端是包配置合法性的最终校验方。

## Composer 中的 Agent 挂载

“+ → 连接器”使用 `GET /api/admin/agents/connectors?agentKey=<key>` 读取源配置中的 `connectorIds`，已挂载的连接器（例如 zenmi 的已有配置）首次打开即显示开启。`activeConnectorIds` 表示当前运行定义，`reloadPending` 表示它与已保存配置仍不一致。授权状态与挂载状态独立：已挂载但未授权时保留开启的开关，同时显示授权入口；关闭开关不注销部署共享账号。builtin 包只读不限制 Agent 挂载开关。

切换通过 `PUT /api/admin/agents/connectors` 提交 `{agentKey, connectorId, enabled}`，由平台修改 `agent.yml` 的 `connectorConfig.connectors` 并重载。保存期间显示加载并禁止重复切换，成功后使用响应中的配置；失败保留诊断并重新读取源配置，避免网络中断后误报状态。初始配置加载失败时不假设所有连接器关闭，提供重试。切换 Agent 或关闭面板后忽略旧响应。

收到 `catalog.updated(reason=agents|connectors|config)` 或页面恢复可见时刷新配置；`reloadPending` 时显示已保存、等待重载提示，并每 2 秒确认一次，生效或读取失败后停止。活跃 Run、子调用、Team 成员或 Terminal 租约导致的延后生效由 Platform 现有发布规则处理。该配置作用于 Agent 的后续运行，不进入聊天 Query 参数。

## 账号授权
现有详情页概览中的“账号授权”区域按目录返回的 `auth_mode` 决定交互：`null/oauth/mcp` 查询统一状态 API；`null` 表示由连接器处理认证，受管 CLI 沿用统一登录流程，服务端返回 `delegated` 时显示“由连接器管理”，引导按技能说明操作，不提供登录或退出按钮。`oneid-token` 查询并展示 Desktop SSO 状态，仅提供重新检查和 Desktop 登录说明，不调用连接器登录、取消或退出接口。`token` 引导到现有配置页。兼容旧服务返回的 `cli` 登录模式与 `none` 无需授权模式；当前 Platform 会将旧包中的 `cli/none` 规范化为目录中的 `null`，因此不能只检查旧字符串，也不能把 `null` 当成无需认证。前端不根据连接器 id 分支，不执行 CLI 或安装命令；实际认证声明、依赖准备、OAuth 发现及凭据保管均由后端从 cli.json/mcp.json 和清单解释。

列表与详情共用页面内的授权观察器，进入目录后自动读取 `null/cli/oauth/mcp/oneid-token` 的连接器状态，展示 not_required/delegated/setup_required/unauthorized/preparing/pending/authorized/failed/canceled。旧 `none` 无需授权及 `token` 凭据配置类型不请求交互授权接口。preparing/pending 每次响应后等待 2 秒再检查；网络错误退避至 5 秒，401/403/404/405 停止自动重试并展示身份、权限或版本诊断。请求 20 秒超时后可重新检查。sessionId 为空及 expiresAt 的零时间不会误判过期；有效期限到达时禁止打开旧链接，显示过期和重试入口。重试仍活动的过期会话会先取消，再发起新登录。

pending 时展示后端返回的“打开授权页面”链接，只接受无用户名密码的显式 HTTP(S) URL，使用新页面、noopener/noreferrer 与 no-referrer。入口由用户直接点击，避免依赖异步自动弹窗；链接会保留供浏览器拦截后手动再次打开。页面仅在后端返回 authorized 后显示成功，扫码、打开链接或时间到达均不代表授权完成。

操作使用同步请求锁避免重复提交；取消或退出会使旧轮询结果失效。切换条目、筛选和页签时复用同一观察器，不清空已知状态，也不额外创建详情查询。离开整个管理台或连接器从目录移除时才取消排队及进行中的请求、清理定时器，不向后端发送取消或退出。所有授权请求使用现有 Platform API 身份客户端和 `{code,msg,data}`，设置 `cache: no-store`，仅在当前页面内保留会话，不进入通用查询缓存、localStorage、sessionStorage 或导出。

状态 API 保持现有同步 HTTP 请求/响应契约，异步调度由 WebClient 完成，目录加载不等待授权检查。后台最多并发 2 个状态请求，为当前选中连接器另预留 1 个名额；排队时间不计入网络超时。点击条目（包括当前选中项）或手工刷新立即重查，同一连接器已有请求时合并，不重复发送。已有状态在重查期间保留。普通状态检查完成后间隔 30 秒刷新，隐藏页面暂停后台检查，重新可见时只刷新已过期结果；登录进行中沿用上述快速轮询与错误退避。首次观察已授权状态不会为每个连接器重复刷新目录。

授权变化后刷新目录、详情中的 MCP 元数据和工具快照，不重载配置草稿。登录成功与 MCP tools/list 同步就绪分别展示。账号授权按部署共享，退出前需在页面内确认影响范围。OAuth/MCP 回调要求浏览器与 Platform 在同一台机器，当前不支持远程浏览器回调。联调需要运行带上述接口的 Platform 版本及有效平台身份，旧服务需要更新并重启；真实扫码或账号确认由用户完成。

## 技能详情
进入技能页时按连接器 ID 加载独立技能列表，自动选择第一项，也可切换技能查看描述、版本、触发词、文档相对路径和更新时间。SKILL.md 提供 Markdown 说明预览和完整源码，只读展示不执行脚本、不编辑包内容。页签数量来自连接器目录；无技能、加载失败和重试有独立状态。

技能页固定顶部页签，连接器列表、技能列表、技能详情各自独立滚动，滚动到底部不会带动外层页面。窄窗口按可用空间分区排列；切换技能时详情回到顶部。技能区不再保留自动导入说明和常驻刷新按钮，加载失败时仍提供重试。

打开技能页不丢弃概览或配置草稿，返回原文件无需再次加载。切换连接器、技能或重试时忽略旧响应，避免同名技能串包。技能版本或名称集合变化会刷新技能列表，也可重新进入技能页加载内容。

## ZIP 导入
目录工具栏使用“+”图标按钮打开导入，保留“导入”的悬停提示和无障碍名称，支持选择或拖入单个 ZIP 文件。前端检查 ZIP 扩展名、非空和 64 MiB 上传上限；完整包结构、解压大小、路径安全和 manifest 校验交由后端。ZIP 可以直接包含 connector.json，也可以使用与包 id 一致的单层目录，按需携带 cli.json、mcp.json、bin 和 skills。

首次上传不覆盖已安装包。仅当后端返回 `409 connector_exists` 时展示覆盖警告，用户再次点击“确认覆盖导入”后才发送 `overwrite=true`；更换文件清除覆盖状态。413 显示服务器大小限制提示，内置包覆盖错误显示只读说明，其他错误展示后端诊断并保留所选文件。

存在未保存配置时，导入前确认丢弃；取消或请求失败保留原草稿。上传期间禁止重复提交、关闭弹窗、切换连接器和保存配置。成功后刷新目录、清除搜索筛选并选中返回的 id；目录刷新失败单独展示加载错误，不把已完成安装报告为导入失败。

## 实时刷新
首次加载、手工刷新和保存后刷新目录与工具快照；订阅 `catalog.updated(reason=connectors|config)` 并在页面可见时每 5 秒轮询兜底。后台刷新不重载编辑内容；列表与详情均忽略过期请求结果，防止切换连接器后的迟到响应覆盖当前配置。

## 主要代码
- `src/app/pages/connectors/index.tsx`
- `src/features/connectors/components/ConnectorsConsole.tsx`
- `src/features/connectors/components/ConnectorConfigEditor.tsx`
- `src/features/connectors/components/ConnectorComponents.tsx`
- `src/features/connectors/components/ConnectorSkills.tsx`
- `src/features/connectors/components/ConnectorImportModal.tsx`
- `src/features/connectors/components/ConnectorAuthPanel.tsx`
- `src/features/connectors/components/ConnectorAuthObserver.tsx`
- `src/features/connectors/hooks/useConnectorsRuntime.ts`
- `src/features/connectors/hooks/useConnectorImport.ts`
- `src/features/connectors/hooks/useConnectorAuth.ts`
- `src/features/connectors/hooks/useConnectorSkills.ts`
- `src/features/connectors/lib/connectorAuth.ts`
- `src/features/connectors/lib/connectorAuthChecks.ts`
- `src/shared/data/api/dto/connectors.ts`
- `src/shared/data/api/requests/connectors.ts`

## VIEW

连接器主类型增加 `view`，组件摘要提供 `hasView/views`，管理台可筛选 VIEW、查看 key/renderer/usage 并编辑 `view.json`。可与 MCP/CLI 同包，复用原 ZIP 导入与 hash 并发保存。渲染接入见 [VIEW连接器](46-交互容器-VIEW连接器.md)。
