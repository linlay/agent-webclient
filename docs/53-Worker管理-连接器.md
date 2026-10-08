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
- `PUT /api/admin/connectors/auth?id=...` 仅以 `{credentials}` 提交清单 `token_schema` 声明的私有字段；不修改连接器包定义。
- `GET /api/connectors/connection?id=...` 读取独立的配置完成、认证、CLI 准备与就绪状态。`POST /api/admin/connectors/prepare?id=...` 明确准备 CLI；GET 不执行安装、登录或远端探测。
- `POST /api/connectors/connect?id=...` 明确确认 delegated 或 oneid-token 连接；`POST /api/connectors/check?id=...` 手工验证当前连接及待验证候选。

旧 MCP Registry YAML 接口与前端实现已移除。页面支持外部连接器 ZIP 导入与删除确认；`builtin` 或 `readOnly` 标记的内置包仅可查看和复制配置，不能保存或通过 ZIP 覆盖。

## 展示与编辑
列表按名称、id、技能和组件 serverKey 搜索。搜索框复用 /registries 的 SearchFilterBar，输入框右侧筛选菜单提供全部、MCP、CLI、VIEW；非全部筛选时高亮入口。组件筛选依据 hasMcp/hasCli/hasView，同一混合包可以出现在多种筛选结果中。管理列表和详情页签旁使用目录返回的 iconUrl 展示品牌图标；缺失、HTTP 失败或图片解码失败时回退 hub。图标通过带鉴权的 HTTP Blob 请求读取 /api/connectors/icon，不把凭据放在 URL，也不把 SVG 插入 DOM；URL 随版本变化后重新加载，切换或卸载时取消请求并释放 Blob URL。connector.json 的 icon 包内路径由表单编辑保留，也可在 JSON 源码中修改。

列表不显示 ID：首行名称与版本两端对齐，底行左侧显示授权状态或同步失败，右侧显示 CLI/MCP 类型。目录加载完成后对需要查询授权的模式逐项异步检查，首次显示“检查中”；no_auth 直接显示“无需配置”，不请求认证接口；检查失败时明确提示并保留上次已知状态。布局参考技能管理台，以标题和间距分组，减少嵌套边框。

详情分为“概览 / 配置 / 技能（数量）”。概览保留基本信息与账号授权，配置展示 CLI/bin 说明、MCP 组件、工具及同步状态；CLI 的 init/versionCheck/登录声明不会由配置编辑页面执行，包内可执行文件可以随 ZIP 导入。

MCP 组件分别展示 unmounted/pending/syncing/ready/unavailable/disabled、工具数、同步时间和诊断。未挂载组件提示挂载到 Agent 后同步；unavailable 且存在工具时标记上次成功快照；ready 且 toolCount 为零时明确表示远端返回零工具。serverKey 使用后端返回的完整值，不根据 id 前缀猜测归属。

详情不再重复渲染名称、ID、描述头部。“概览”的基本信息是 connector.json 的唯一编辑入口，支持名称、版本、描述表单和完整 JSON 源码；主类型、ID 与认证声明也在这里展示。“配置”只展示包实际包含的 cli.json/mcp.json；仅有一个组件时不重复展示文件选择按钮。概览与配置由当前文件统一驱动，切换被未保存确认阻止时不会产生标签与编辑文件错位。

基本信息顶部按 ID、主类型、认证方式排列三个只读 Input；下一行展示名称和版本，描述独占一行。内置或只读连接器的全部字段保持只读，外部连接器保留名称、版本和描述的编辑与保存能力。

MCP 支持每个组件的完整 HTTP URL、stdio 命令与参数、毫秒超时。HTTP URL 不追加隐式 /mcp。JSON 源码可编辑完整定义，包括 CLI、认证声明、环境变量、请求头和 platform 高级字段；表单修改保留其他组件及未展示字段。

所有 JSON 配置源码统一复用 Monaco CodeEditor，包括 connector.json、cli.json、mcp.json 与 view.json。支持 JSON 高亮、行号、折叠和查找，跟随页面主题；内置配置及保存期间只读，仍可查看和复制。编辑器模型按连接器 ID 和配置文件隔离。

表单与源码共用一份草稿。切换文件、离开页面和重新加载时保护未保存修改；保存冲突（409）保留草稿与原始哈希，提示用户复制修改后重新加载并合并。校验或保存失败同样保留草稿。后端是包配置合法性的最终校验方。

## Composer 中的 Agent 挂载

目录读取、挂载读取和开关写入统一经 `routedClient` 选择传输。Platform 复用现有主 WebSocket（Desktop 经 Frame Port/Broker），Gateway 未支持这些 WS 路由时静态使用 HTTP；WS 失败不回退 HTTP、不自动重放写入。目录不进入 server-state 缓存，每次打开及既有目录更新、页面可见刷新均重新读取；挂载状态复用共享 Agent 和详情缓存，不新增挂载 GET。管理目录、认证和图标沿用各自 HTTP 路径。

WS `/api/agent` 返回 tools/skills/connectors ID 数组；WS `/api/connectors` 使用可选 `{agentKey}` 读取目录和状态；WS `/api/agents/connectors` 使用 `{agentKey,connectorId,enabled}` 更新单项。Platform 保留旧挂载 GET/WS 读取兼容，WebClient 不再调用。只要出现 connectorId 或 enabled 就按写请求校验，包括 `enabled:false`、null 和不完整写入；响应仍为原有精简 DTO。

“+ → 连接器”使用 `GET /api/connectors?agentKey=<key>` 读取精简候选目录，返回 id/name、非空 description/iconUrl/mutuallyExclusiveWith、本地 readiness 与可选 mcp[]（agentKey/serverKey/status/toolCount）；搜索仅匹配 id、名称和说明。默认预置由 Platform 的全局与 mode 配置决定，不出现在候选和挂载 ID 中。非预置 builtin 仍可选择，包只读不限制普通挂载开关。

开关读取 `/api/agent.connectors` 的已保存非预置 ID；`PUT /api/agents/connectors` 仅提交 `{agentKey,connectorId,enabled}`，响应仍为 `{agentKey,connectorIds,reloadPending}`。目录在指定 Agent 时返回 agentKey 和 reloadPending，表示完整配置与运行时仍不一致；全局目录省略这两个字段。账号授权与挂载独立，关闭开关不注销部署共享账号。Composer 不请求 admin 目录或挂载接口，也不接收版本、认证详情、组件清单、技能或 activeConnectorIds。

目录状态只读取既有认证/准备及 MCP 同步快照，不执行 CLI 或主动探测上游。菜单打开期间，仅 reloadPending、preparing/pending_verification 或 MCP pending/syncing 每次响应后间隔 2 秒补查目录；状态稳定、读取失败或关闭菜单后停止。未挂载与不可用分别显示，不用可用性推断开关。

保存期间使 Agent 详情缓存与在途可用性检查失效，显示加载并禁止重复切换，成功后使用响应中的配置；失败保留诊断并重新读取源配置，避免网络中断后误报状态。初始配置加载失败时不假设所有连接器关闭，提供重试。切换 Agent 或关闭面板后忽略旧响应。

`/agents/:agentKey` 的能力区通过 `/api/admin/agents/connectors`、`/api/admin/connectors` 与 `/api/admin/tools` 展示预置、声明及当前生效挂载。连接器默认折叠，展开查看其工具和 CLI/VIEW/技能能力，原生工具用 nativeTools 归属、MCP 服务按当前 agentKey 隔离；不重复出现在自身工具区。预置带锁，无挂载修改入口。管理“发起对话”仍使用管理挂载接口的完整 activeConnectorIds，确认生效后导航。两套挂载 PUT 均拒绝预置修改（403 preset_connector_readonly），预置运行时工具和技能仍正常挂载。

## 账号授权
现有详情页概览中的“账号授权”区域按目录返回的 `auth_mode` 决定交互：`no_auth` 直接显示“无需配置”，不请求认证接口；`null/oauth/mcp` 查询统一状态 API；`null` 表示由连接器处理认证，受管 CLI 沿用统一登录流程，服务端返回 `delegated` 时显示“由连接器管理”，引导按技能说明操作，不提供登录或退出按钮。`oneid-token` 查询并展示 Desktop SSO 状态，仅提供重新检查和 Desktop 登录说明，不调用连接器登录、取消或退出接口。`token` 使用独立私有凭据弹窗，字段仅来自清单 `token_schema`；实际值不进入 connector.json、cli.json、mcp.json 或对话草稿。兼容旧服务返回的 `cli` 登录模式与 `none` 无需授权模式；当前 Platform 会将旧包中的 `cli/none` 规范化为目录中的 `null`，因此不能只检查旧字符串，也不能把 `null` 当成无需认证。前端不根据连接器 id 分支，不执行 CLI 或安装命令；实际认证声明、依赖准备、OAuth 发现及凭据保管均由后端从 cli.json/mcp.json 和清单解释。

列表与详情共用页面内的授权观察器，进入目录后自动读取 `null/cli/oauth/mcp/oneid-token` 的连接器状态，展示 no_auth/not_required/delegated/setup_required/unauthorized/preparing/pending/authorized/failed/canceled。`no_auth`、旧 `none` 无需授权模式不查询授权接口。`token` 读取真实凭据状态，但不调用交互登录接口；配置完成和认证可用性不能由认证模式推定。preparing/pending 每次响应后等待 2 秒再检查；网络错误退避至 5 秒，401/403/404/405 停止自动重试并展示身份、权限或版本诊断。请求 20 秒超时后可重新检查。sessionId 为空及 expiresAt 的零时间不会误判过期；有效期限到达时禁止打开旧链接，显示过期和重试入口。重试仍活动的过期会话会先取消，再发起新登录。

pending 时展示后端返回的“打开授权页面”链接，只接受无用户名密码的显式 HTTP(S) URL，使用新页面、noopener/noreferrer 与 no-referrer。入口由用户直接点击，避免依赖异步自动弹窗；链接会保留供浏览器拦截后手动再次打开。页面仅在后端返回 authorized 后显示成功，扫码、打开链接或时间到达均不代表授权完成。

操作使用同步请求锁避免重复提交；取消或退出会使旧轮询结果失效。切换条目、筛选和页签时复用同一观察器，不清空已知状态，也不额外创建详情查询。离开整个管理台或连接器从目录移除时才取消排队及进行中的请求、清理定时器，不向后端发送取消或退出。所有授权请求使用现有 Platform API 身份客户端和 `{code,msg,data}`，设置 `cache: no-store`，仅在当前页面内保留会话，不进入通用查询缓存、localStorage、sessionStorage 或导出。

状态 API 保持现有同步 HTTP 请求/响应契约，异步调度由 WebClient 完成，目录加载不等待授权检查。后台最多并发 2 个状态请求，为当前选中连接器另预留 1 个名额；排队时间不计入网络超时。点击条目（包括当前选中项）或手工刷新立即重查，同一连接器已有请求时合并，不重复发送。已有状态在重查期间保留。普通状态检查完成后间隔 30 秒刷新，隐藏页面暂停后台检查，重新可见时只刷新已过期结果；登录进行中沿用上述快速轮询与错误退避。首次观察已授权状态不会为每个连接器重复刷新目录。

授权变化后刷新目录、详情中的 MCP 元数据和工具快照，不重载配置草稿。登录成功与 MCP tools/list 同步就绪分别展示。账号授权按部署共享，退出前需在页面内确认影响范围。OAuth/MCP 回调要求浏览器与 Platform 在同一台机器，当前不支持远程浏览器回调。联调需要运行带上述接口的 Platform 版本及有效平台身份，旧服务需要更新并重启；真实扫码或账号确认由用户完成。

## 技能详情
进入技能页时按连接器 ID 加载独立技能列表，自动选择第一项，也可切换技能查看描述、版本、触发词、文档相对路径和更新时间。SKILL.md 提供 Markdown 说明预览和完整源码，只读展示不执行脚本、不编辑包内容。页签数量来自连接器目录；无技能、加载失败和重试有独立状态。

技能页固定顶部页签，连接器列表、技能列表、技能详情各自独立滚动，滚动到底部不会带动外层页面。窄窗口按可用空间分区排列；切换技能时详情回到顶部。技能区不再保留自动导入说明和常驻刷新按钮，加载失败时仍提供重试。

打开技能页不丢弃概览或配置草稿，返回原文件无需再次加载。切换连接器、技能或重试时忽略旧响应，避免同名技能串包。技能版本或名称集合变化会刷新技能列表，也可重新进入技能页加载内容。

## ZIP 导入
目录工具栏使用“+”弹出菜单，选择「导入 ZIP」打开导入，选择「通过对话创建」打开创建对话，保留“导入”的悬停提示和无障碍名称，支持选择或拖入单个 ZIP 文件。前端检查 ZIP 扩展名、非空和 64 MiB 上传上限；完整包结构、解压大小、路径安全和 manifest 校验交由后端。ZIP 可以直接包含 connector.json，也可以使用与包 id 一致的单层目录，按需携带 cli.json、mcp.json、bin 和 skills。

首次上传不覆盖已安装包。仅当后端返回 `409 connector_exists` 时展示覆盖警告，用户再次点击“确认覆盖导入”后才发送 `overwrite=true`；更换文件清除覆盖状态。413 显示服务器大小限制提示，内置包覆盖错误显示只读说明，其他错误展示后端诊断并保留所选文件。

存在未保存配置时，导入前确认丢弃；取消或请求失败保留原草稿。上传期间禁止重复提交、关闭弹窗、切换连接器和保存配置。成功后刷新目录、清除搜索筛选并选中返回的 id；目录刷新失败单独展示加载错误，不把已完成安装报告为导入失败。

## 删除连接器

错误展示保留 HTTP 响应中的业务错误码、原因和占用名单。已知错误码映射为具体处理建议；未知错误不默认建议稍后重试，详情展示脱敏后的后端原因。HTTP 兜底状态文本不得覆盖响应中的真实原因。


外部连接器的概览和配置页操作区提供“删除连接器”，内置、只读或 `canDelete:false` 的条目不显示。确认窗口列出名称与 id，说明会移除安装包、组件和技能，授权与 CLI 状态保留；存在草稿时同时提示丢弃未保存修改。

确认后调用 `DELETE /api/admin/connectors/detail?id=<id>`。操作期间禁止重复删除、配置保存、导入与切换目标。后端以当前 Agent 源码与已发布运行挂载检查占用；409 的 `data.error.agentKeys` 用于提示需要取消挂载的 Agent，并提示等待相关 Run/Terminal 结束。取消或失败保留当前选择、配置草稿和原 hash。成功后移除列表项、清理草稿、返回连接器列表并刷新目录与置顶；删除最后一项显示空态。后续刷新失败单独报告，过期目录响应不能把已删除项加回。

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

## 连接器中心置顶

设置入口与独立页面标题统一使用“连接器中心”。每个连接器名称右侧支持独立的置顶按钮，未置顶时悬停或键盘聚焦显示灰色小图标，已置顶时常显主题正文色。按钮透明、无独立列宽；置顶不切换选中项，不修改配置、授权或编辑草稿。内置只读连接器也可以置顶。

使用 `GET /api/connectors/order` 和 `PUT /api/connectors/order` 的 `{id,pinned}` 保存到平台 `runtime/connectors-center/order.json`；平台 WebSocket 同路径支持读取与单项更新。偏好按用户区分、跨 Agent 共享，与技能置顶彼此独立。前端仅保留内存缓存，打开页面、手工刷新和窗口重新聚焦时重新读取；保存成功后才排序，失败保留现有顺序并提供重试。

## 连接器内嵌授权

Platform 从 `connector.json.auth_browser` 固定会话展示策略，start/status 的 `authBrowser` 为唯一运行时事实源；省略保持 system。WebClient 不读取 CLI 配置。只有当前观察器发起或显式继续的授权会话展示弹窗，列表后台检查不自动弹窗。

Standalone 使用 sandbox 模态 iframe；Desktop 使用独立 v1 Connector Auth Browser bridge，通过 connectorId/sessionId 请求宿主重新校验会话并打开隔离 WebView。缺失 bridge 或嵌入失败不降级外部浏览器。授权成功只依据 Platform 状态。用户关闭弹窗通过带 sessionId 的取消接口取消当前会话；页面卸载只关闭展示与观察，不注销凭据。

## 对话辅助入口

手工创建、编辑、保存与对话方式并存。独立的「通过对话创建／修改」入口使用默认 Chat 智能体，预选 `platform-admin` 并填写草稿，不自动发送。保留原有表单、源码编辑、ZIP 导入及只读边界；连接器手工新增沿用 ZIP 导入。详见[资源对话创建与修改](01-应用基础-应用入口路由与布局壳层.md#资源对话创建与修改)。


## 六种 auth_mode

当前协议支持六种模式；旧字符串 none/cli 仅是历史别名，不作为独立模式计数。

| 模式 | 语义与界面行为 |
| --- | --- |
| no_auth | 无需认证，挂载即可使用；显示“无需配置”，不检查、不轮询、不提供登录或断开认证按钮 |
| null | 认证由连接器 Skill / CLI / SDK 管理；受管 CLI 支持登录，delegated 不显示登录退出 |
| token | 依据 token_schema 的私有凭据弹窗配置，读取 configured/authorized/pending_verification |
| oneid-token | 使用 Desktop SSO，连接器内不提供登录退出 |
| oauth | 普通 OAuth 授权 |
| mcp | MCP OAuth 授权 |

Desktop 声明 no_auth，详情与列表复用通用认证展示，不保留 native 专用配置面板或 connection.json 操作。Composer “+”菜单只保留挂载开关，不显示“检查中”或“连接”；挂载不等于客户端在线，实际路由、权限和可用性由调用结果说明。取消使用通过移除 Agent 挂载完成。

Connection DTO 接收 configurationRequired、authentication、capabilities 和独立 preparation。no_auth 的 configurationRequired=false、canConnect/canDisconnect/canCheck=false，configured=false 不能解释为未连接。认证 hook 依据清单 no_auth 直接进入终态，既不请求认证接口也不使用配置完成标记；CLI 安装准备与 MCP 同步状态独立于认证状态。

## Agent 连接器互斥选择

目录 DTO 接收包清单的可选 `mutuallyExclusiveWith`。Composer 选择器依据未经过搜索筛选的使用目录和当前 Agent 已选 ID 双向判断：任意一方声明即冲突，未声明不推导，搜索过滤不影响判断，源码不保留 Desktop ID 特例。

冲突项保留可点击开关；点击时不发送保存请求，弹出中英文错误并在列表顶部显示“无法选择‘名称’：已选择与其互斥的‘冲突名称’。请先取消原选择。”原选择不变，不自动替换；取消原选择后可正常选择另一项。名称来自目录本地化值，找不到时回退 ID。

服务端最终校验。`PUT /api/agents/connectors` 失败中的 `data.error.code=connector_selection_conflict`、`connectorId` 和 `conflictingConnectorIds` 映射为相同提示；其他保存失败显示实际错误。HTTP 非 2xx 与 HTTP 200 业务失败都保留错误详情；失败重新读取来源，不乐观切换开关。加载错误位于列表之前。相关组件、hook 和 API 测试覆盖单向声明的两种选择顺序、搜索、取消后切换、过期目录和保存失败。


## 私有凭据与业务对话

账号授权、部署配置完成、CLI 准备、Agent 挂载与运行态发布相互独立。`configured` 只表示已完成部署配置；`pendingVerification=true` 表示新候选仍在验证，旧有效凭据可以保持 authorized/ready。仅 pending_verification 的首次配置不视为可用。delegated 与 oneid-token 在概览通过用户显式“确认连接”保存配置完成事实；该动作不登录或退出 Desktop 身份。

私有凭据弹窗只读取 token_schema 的字段声明，兼容 Platform 已定义的 name/key、默认 password 元数据；仅 text 字段使用声明的默认值，password 不预填。值只留在当前弹窗内存，取消、成功、切换连接器、离开组件时清空或丢弃；schema 缺失不引导用户把凭据写入包 JSON。请求使用现有身份 HTTP 客户端、no-store 和禁止自动重放，不进入 data-request/WS 调试帧、server-state 缓存、浏览器存储或 URL。错误只显示本地化通用说明，不能保留或渲染可能回显凭据的后端原始原因；无法确认保存结果时清空输入并要求先检查服务端状态，再由用户决定新一次写入。CLI 类型保存前同样先确认准备就绪。

连接器详情新增业务“去对话”，与使用 platform-admin 的“通过对话修改”分别服务实际使用和包定义编辑。业务入口按资源助手相同规则解析默认普通 Chat Agent，先检查准备状态，需要时显式 POST prepare 并进行有界观察；未完成配置或授权时保留本页并引导概览。连接就绪后读取/设置该 Agent 的实际安装包 connectorId，等 activeConnectorIds 包含它且 reloadPending=false 才导航。已经生效不重复挂载；写结果未知只重读真实状态，不重放变更。等待期间切换条目、离开页面或改动配置草稿均不得由迟到结果跳走，准备按连接器部署共享，当前协议没有本页独占的任务身份；取消等待与页面卸载均只停止本页观察，不取消共享准备。

业务导航使用 newChat + 显式 composerDraft（无例文时为空字符串），不携带 composerSkill，不自动发送。输入草稿、上次技能的替换和一次性参数消费归 Chat Composer；管理宿主按相同规则交接。安装包 ID 来自目录和 Platform 响应，不根据 Market 资源 ID 猜测。

Standalone 业务“去对话”在准备/挂载前确认未保存修改，确认与管理台 Router blocker 共用一次性许可。许可绑定当时的连接器、文件、原哈希、草稿编辑版本，并只在操作成功后为精确 pathname/search/hash 授予；任意路由尝试即消费，后续编辑（含撤销恢复同样文字）、保存、取消或失败都不能复用。该许可不清 dirty、不删除草稿、不放行其他目标。包定义的“通过对话创建／修改”在 Standalone 只由最终 Router blocker 确认；Desktop 保留原有前置确认及宿主导航。
