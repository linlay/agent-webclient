# API端点注册与DTO

## 当前状态

ACP 引擎域已接入公共目录、配置预览、会话准备/配置与认证。消费类型归 `src/shared/data/api/dto/agentEngine.ts`，请求归 `src/shared/data/api/requests/agentEngine.ts`，Composer 状态归 `useEngineSession`；不建立专属 Schema、类型生成或跨仓同步流程。当前行为与验收见 [运行参数与外部会话](23-对话输入-运行参数模型与访问级别.md)，不依赖工作区计划。

WebClient 只消费公共目录、配置、认证状态与业务 HITL，不持有管理秘密、可信交付根、RPC ID 或连接代次。模型和选项 ID/value 保持原样，外部权限沿用标准 approval 的 approve/reject 提交，上游 optionId 仅在 Platform 适配层映射；提问沿用 Question 容器。类型和正常/错误样例通过只读测试核对。
接口端点集中注册在 `src/shared/data/api/endpoints.ts`，DTO 位于 `src/shared/data/api/dto/`，HTTP helper 位于 `src/shared/data/api/http.ts`，具体请求位于 `api/requests/`；`shared/data/index.ts` 提供公共入口，`routedClient.ts` 负责 HTTP/WS 路由。端点声明包含 key、path、method、transport、wsBackends、cache 和 payload 构造函数；所有 `auto` 端点必须显式声明支持 WS 的 backend。

## 核心职责
- 统一维护 `/api/*`、`/ws`、`/api/voice/*`、`/api/resource` 等前端消费入口。
- 为 agent、team、chat、archive、automation、memory、registry、run、voice、resource 等接口提供类型。
- 通过 `defineEndpoint` 和 `createEndpointRegistry` 保持端点声明可检索。
- 为上传、下载、资源文本读取和 viewport 读取提供专门 helper。

## 核心流程
普通数据业务从 `src/shared/data` 导入语义化函数，不直接拼接 URL。Run 生命周期由 `RunTransport` 使用 `endpoints.ts` 的 payload builder 和端点定义统一发送；管理源文件通过 Admin Source 读写，语音能力与 voice 列表通过 flexible voice helper 读取。

`ChatDetailResponse` 继承完整 `ChatSummaryResponse`：`/api/chat` 除 replay 数据外必须提供 `agentKey`、`lastRunId`、`lastRunContent` 与 `read { isRead, readAt?, readRunId? }`。`markChatRead` 是 WebClient Main Chat 的单 Chat read 请求函数；Desktop 模式仍通过通用 Frame Port `/api/read` 转发，Desktop 宿主不暴露或调用单 Chat read 业务 IPC。Agent 级批量已读属于宿主的显式用户命令，不由 WebClient 的自动 read hook 代发。

`GET /api/agent?agentKey=...` 的 `AgentDetailResponse` 保留 `greetings?: string[]` 并新增 `introductions?: string[]`：分别供新会话主标题和输入框 placeholder 随机展示。两个字段不进入 `/api/agents` 列表摘要，管理台通过现有详情和保存接口读写同名配置数组。

`AgentDetailResponse` 的 tools、skills、connectors 都是 string[]，不携带 toolBindings 或技能展示对象。tools/skills 反映已发布的运行时，connectors 反映已保存的非预置挂载；活动 Run 延后生效时不回滚开关。AdminAgentDetailResponse 和 AdminAgentSaveResponse 独立保留 toolBindings，管理表单继续使用 definition。Composer 的 skills 展示名与 description 读取 `/api/skills`；连接器目录返回本地 readiness、MCP 同步快照和 Agent 范围的 reloadPending，不复制认证详情。

Agent 顺序有两条 HTTP-only 数据边界：普通客户端通过 `GET/PUT /api/agents/order` 读取和提交全部有效 runtime Agent 的 catalog 顺序；Agent 管理台从 `/api/admin/agents` 的列表顺序初始化，并通过 `PUT /api/admin/agents/order` 提交包含 invalid Agent 的完整 admin 顺序。两者复用 `AgentOrderResponse { version, order, updatedAt? }`，其中未生成顺序文件时 `updatedAt` 可以省略；前端不把 public endpoint 注册为 WebSocket route，也不把管理台切到 public mutation。

静态 HTML 导出并行请求 `GET /api/chat/export?chatId=...&format=snapshot` 与 `CONVERSATION_EXPORT_ASSET_ORIGIN/assets/conversation-export/conversation.template.html`。Snapshot 保持 Blob，service 层只解析小体积模板并用 Blob parts 组装完整文档；Platform 不提供 HTML 格式。公开分享由 Desktop 直接向 Tunnel 上传 Snapshot，Tunnel 使用同一当前模板生成页面。`src/shared/data/conversationSharePath.ts` 只负责将合法 `shareId` 构造成 `/share/{id}` 路径。

文件地址只认显式根：`@chat/<path>` 是当前 Chat 文件，`@workspace/<path>[:line]` 是绑定项目文件，路径是字面值，不做百分号解码。没有根的相对路径（`artifacts/...`、`src/app.ts`、`report.md`）不再按 Chat 或 Workspace 猜测，分类为 `invalid` 并带 `unscoped` 原因。前端统一通过 `classifyResourceUrl` 分类：`@chat/` 需要绑定的 chatId（缺失时为 `chat_context_required`），由 `URLSearchParams` 转换为 `GET /api/resource?file=<chatId>/<逐段编码的 relativePath>`，Platform 解码一次并保留字面 `%`。POSIX 绝对路径、带盘符的 Windows 路径与本机 `file://` URL 都是 Workspace 文件，经 `GET /api/file?agentKey=...&path=...` 由 Platform 按其主机平台规则解析，只接受 Workspace 内文件并拒绝 chats 根；UNC 与 `file://host/` 识别为 `unsupported_path` 暂不支持。HTTP(S)、`data:`、`blob:` 直接使用且不接收平台 Bearer；同源 `/api/resource` 与其他 `/api/` 路径、空段、`.`/`..`（含编码形式）都不发起 fetch。`downloadResource`、`getResourceText`、`getResourceBlob` 只对 `@chat/` 使用 Bearer/Cookie，组件不手工拼接真实资源请求。

`RunTransport.startBtw` 通过 Platform stream 向 `/api/btw` 发起 BTW Run。其 DTO 只发送父 `chatId`、可选 `btwId` 和 query 参数，不发送 agent/team/planning 路由字段；这些身份由后端从父对话继承。

对话页通过 `GET /api/skills?agentKey=...` 读取 `AgentSkillsResponse`，响应含 `skills` 和用户级 `pinned`，每项消费 `key/name/description/icon/configured`。`agentKey` 可选，仅用于标记配置状态，不筛选全局目录；未提供时 configured 均为 false。该端点注册为 Platform-only `auto`：Platform 模式向 `/api/skills` 发送 `{agentKey}` request frame，Gateway 因未暴露该 WS route 而在请求前选择 HTTP；WS 连接或传输故障不回退 HTTP。结果按 Agent 缓存 30 秒并合并并发读取。置顶通过同路径 PUT `{id,pinned}` 写入；菜单一次查询同时获得目录和置顶，写入成功后同步用户级内存置顶投影并失效目录请求缓存。该接口与 `/api/admin/skills` 安装编辑管理接口职责分离。

## Skills 管理契约

Skills 管理接口使用 `/api/admin/skills/*` 的 manifest 与文件操作契约。列表返回 `AdminSkillsResponse {skills,packages,pinned}`，详情返回 `AdminSkillDetailResponse`；文本内容通过 `getAdminSource`、`updateAdminSource` 读写，创建文件/目录、重命名、删除、上传、下载、校验、创建和 ZIP 导入使用对应的 `AdminSkill*` DTO 与语义化 client 函数。统一 ZIP 导入通过 `importAdminSkill` 向 `POST /api/admin/skills/import` 发送 multipart `file` 与可选 `id`；前端不解压、不从文件名猜身份，也不选择单技能或技能包类型。Platform 读取包根 `package.json` 识别技能包，否则沿用单技能规则；单技能缺省 Key 从 `SKILL.md` 的 `id/name` 读取，包身份来自 `package.json.name`。包清单维护自身元数据及有序的 `skills:[{id}]` 成员声明，id 是包内单段目录名；成员的名称、描述与版本仍来自各自 `SKILL.md`。未声明目录不自动成为成员，空包使用 `skills:[]`。`AdminSkillImportResponse` 通过 `kind` 区分：`skill` 保留原顶层 `AdminSkillDetailResponse` 字段；`skill-package` 返回 `package`（包 ID、名称、版本、成员、归档摘要与安装时间）。旧单技能响应省略 kind 仍兼容。包导入后重新加载全部技能、清除列表过滤，并进入一个已安装成员；当前成员被更新时强制刷新详情。ZIP 上传上限 512 MiB，识别为单技能后由 Platform 执行原 32 MiB 限额。409 保留服务端具体冲突消息，422 文件级诊断留在导入弹窗中。

后端只在发现 `skills-center/<skill-id>/assets/<skill-id>.png` 时返回可直接访问的可选 `icon` URL；未发现则省略该字段。Skills 列表直接使用该 URL，字段为空或图片加载失败时回退到前端静态资源 `/default-skill.png`。

## Agent 创建与管理导入契约

Agent 创建复用 `POST /api/admin/agents/create`。`CreateAgentRequest` 的可选 boolean `isProject` 仅表达请求意图；项目创建 builder 固定传 true，并把用户目录写入 `definition.runtimeConfig.workspaceRoot`。Platform 在写盘前拒绝空值、`@root`、无效目录及 canonical 系统根，普通 Agent 创建省略或传 false 沿用原有规则；该字段不进入 Agent definition 或持久化配置。

完整 Agent ZIP 使用 HTTP-only 端点 `POST /api/admin/agents/import`。`importAdminAgent` 接收 `ImportAgentArchiveRequest { file, overwrite? }` 并发送 multipart：`file` 必填，只有用户确认整目录覆盖后才附加字符串 `overwrite=true`；不得发送 `key` 或 `agentKey`。成功复用 `AdminAgentDetailResponse`，前端读取 `key`、`status` 和 `diagnostics` 完成列表刷新、选中与 ready/invalid 提示。

409 覆盖冲突从 `data.error` 读取 `agentKey`、`existingName` 和 `overwriteRequired:true`；只有满足这份明确契约才展示覆盖确认并用同一 `File` 重试。422 的 `diagnostics[]` 使用 `AdminAgentDiagnostic` 展示 `sourcePath/message`；413、415 和其他错误沿用统一 `ApiError` 消息。该端点不进入 WebSocket/routed client，也不由前端解析 ZIP 中的 YAML。

## 对话运行身份

所有 Agent（包括 mode: TEAM）的内部 `RunOwner` 都是 `{ kind: "agent", agentKey }`。query、attach、submit、steer、interrupt、access-level 与 Automation 只发送 `agentKey`，`owner` 不作为 API 字段发送。已保存 Chat 的 owner 优先于临时选择和成员事件；带 taskId 的成员事件仅更新该任务，不改变根 Run 身份。

## Agent 列表协议

导航通过 `/api/agents` 获取统一 Agent 列表。TEAM 使用普通 key、mode、stats、chats 字段，详情通过 `teamConfig.members/maxParallel` 描述委派配置。HTTP 和 WS 使用相同 DTO；不再请求独立 Team 列表或额外包含开关。前端保留后端顺序，并用父 Agent key 补齐嵌套 Chat 的 agentKey。scope、mode 和 Chat 筛选均遵循普通 Agent 规则。

TEAM 总控可以直接回答、使用普通工具或委派成员；成员不是外层 Chat owner。编辑器允许配置成员 key 和 1–5 的并发数，运行参数、Skills 与模型覆盖只作用于总控。

## 边界与非目标
- `endpoints.ts` 是前端消费清单，不等于后端 OpenAPI 定义。
- DTO 应贴近前端实际读取字段，避免为未使用字段建立庞大类型。
- 管理页和对话页复用同一数据层，不在组件里重复封装 fetch。

## 相关文件
- `../src/shared/data/api/endpointRegistry.ts`
- `../src/shared/data/api/endpoints.ts`
- `../src/shared/data/api/http.ts`
- `../src/shared/data/index.ts`
- `../src/shared/data/api/client.test.ts`
- `../src/shared/data/api/endpoints.test.ts`
- `../src/shared/data/conversationSharePath.ts`

## Chat 置顶

- GET `/api/chats/order`：读取 `sortMode`、`pinnedOrder` 和 `updatedAt`；PUT 或 WS 同路径使用 `{operation:"set_pinned",chatId,pinned}`，排序使用 `{operation:"move",chatId,beforeChatId}` 或 `afterChatId`。置顶组移动不修改普通列表排序。
- Chat 摘要/详情增加可选 `pinned`；GET `/api/chats` 支持 `pinned` 和 `limit`，GET `/api/agents` 支持 `chatsPinned`。`false` 必须在 HTTP query 与 WS payload 中保留，筛选发生在后端 limit/includeChats 之前。
- `chats.order.changed` push 要求 `updatedAt` 为 epoch 毫秒整数。客户端收到后同时使 agents/chats 查询缓存失效并重新加载；WS 重连同样对账。归档、删除清理内存置顶 ID，恢复不继承旧置顶。

## Project Git 独立快照

`project.git` 注册为 auto `/api/project/git`，Platform 走 WS，Gateway 保留 HTTP GET，仅传 `agentKey`。`ProjectGitResponse` 定义在 `shared/data/api/dto/resources.ts`，包含 `agentKey`、`status` 及可选 `branch/commit/reason`。`status` 为 `branch | detached | not_repository | no_workspace | unavailable`，`reason` 为 `workspace_unavailable | git_unavailable | probe_failed | probe_timeout`。响应沿用 `ApiResponse`；缺失参数、未知 Agent、权限错误使用既有错误包裹。HTTP 请求支持 AbortSignal 并禁用 HTTP 缓存；WS 迟到响应由领域生命周期保护丢弃。Composer 按 Workspace 准入，使用短期内存缓存与在途去重。它不进入 Agent 列表/详情 DTO，也不修改已有 Project tree/changes/diff 的范围。

Git 快照增加可选 `revision`，仅有效分支/游离 HEAD 返回。`project.git.branches` 为同域 auto `/api/project/git/branches`（Platform WS / Gateway HTTP GET），响应 `{git,branches,canChange,blockedReason?,expectedBranch?}`；`project.git.branchChange` 为同路径 auto 写入（Platform WS / Gateway HTTP POST），请求 `{agentKey,operation,branch,expectedRevision}`，成功返回最新 Git 快照。WS 读取 payload 为 `{agentKey}`，存在任一写入字段时由 Platform 按 mutation 校验，与 HTTP 复用领域服务及错误语义。写入不设置 UI AbortSignal，也不自动重试或回退 HTTP；超时或连接中断后先刷新确认实际状态。


## 技能目录与技能包管理

技能中心仅通过 HTTP 请求 `/api/admin/skills` 一次获取 skills、packages 和当前用户 pinned，以包声明成员的目录投影及技能的 `packageId` 展示文件夹。独立技能 ID 为 `skill`，包成员 id 为 `package/skill`，同短名两者独立选择、编辑、导入更新和删除，前端不得按 name 合并。聚合读取失败时整体提示重试，刷新失败保留上一份成功目录，不再有独立包列表失败状态。点击包行展开成员并打开概览；概览允许编辑 `package.json`，复用 GET/PUT `/api/admin/source`：读取使用 `type=skill-package&id=包ID`，保存使用 `{target:{type:"skill-package",id},content,baseSha256}`，消费统一 source 响应中的 `content/sha256`，冲突保留草稿；name 不可修改，skills 必须是 `{id}` 对象数组，声明成员范围和顺序。重复键、大小写冲突、非法路径及 Agent 引用等业务校验由 Platform 执行，失败保留草稿与原哈希；从清单移除成员只改变归属，不删除文件。缺少 displayName 回退 name，缺少版本不显示。搜索成员保留父包并自动展开。成员继续使用原技能详情及文件接口编辑，切换包和技能沿用未保存修改确认。包内成员通过 `POST /api/admin/skill-packages/skills/delete` 在同一事务中删除目录并更新清单，整包通过 `POST /api/admin/skill-packages/delete` 卸载，均接受 Platform 引用保护，成功后刷新一次聚合目录。

技能中心与 Composer 的顶层目录使用同一混合列表规则：技能包与独立技能共用用户置顶顺序，置顶项排在最前，其余技能包和独立技能按显示名称一起排序，不显示置顶、技能包或独立技能分区标题。包置顶使用包 ID，独立技能使用技能 ID，管理页通过 HTTP `PUT /api/admin/skills/pin {id,pinned}` 更新同一置顶序列，仅消费返回的 `{pinned}`；包作为整体移动，成员的 `package/skill` 置顶键不会提升所属包。包行置顶按钮只切换置顶状态，不触发展开、选择或文件编辑切换。技能包保留折叠展开层级，包成员只出现在所属包内。搜索框下方提供“技能包”和“独立技能”两个互斥的切换按钮，默认都不选中并显示全部，再次点击已选按钮恢复全部。类型筛选与现有搜索、状态条件取交集，按钮数量按当前搜索与状态条件统计，在类型筛选之前计算。筛选只改变列表可见项，不清空当前选择或编辑草稿，也不改写服务端目录和置顶存储。

技能包可选 `icon` 字段指向 `GET /api/skill-packages/icon?id=<package>`，由 `fetchSkillIcon` 带鉴权读取。管理列表、包概览、Composer 选择树与已选包标签共用图标组件，缺失或加载失败回退文件夹。包图标读取包根 `icon.svg` / `icon.png`，SVG 优先；独立技能和包成员仍使用各自 `assets/`。

管理目录生命周期由 `features/skills/hooks/useAdminSkillCatalog` 负责，初次进入、身份或语言变化、显式刷新和目录 mutation 后读取管理聚合接口；窗口聚焦不自动刷新，较早列表结果和写入前的旧置顶结果不覆盖新状态。失败保留已显示目录和顺序，身份变化隔离数据。使用端置顶 hook 归 Composer，管理页不调用 `/api/skills`，也不初始化或订阅业务 WS；显式启动资源助手属于对话链路。Platform 保留旧包列表 GET 供 Desktop 技能市场，WebClient 不再注册和调用。对象响应与 Platform 配套发布，不兼容旧数组形状，需协调升级与回滚。

## WebApp owner 管理

Platform 模式新增 `/webapps` 页面：单 ZIP 上传审阅后安装，首次 stopped，详情提供静态启停、打开、配置与授权、卸载（默认保留数据）。Desktop/Gateway 不使用此页面。请求与 DTO 在 shared/data 注册，features/webapps 负责界面状态；不跨 feature 依赖，不增加业务 WebSocket。

打开使用一次性票据表单 POST，禁止将凭证放入 URL、持久存储或 opener。先支持 `127.0.0.1` 独立本地端口；远程服务器须转发对应端口，独立域名与 DNS/TLS 后续实施。mutation 不自动重放；旧身份或旧选择的延迟响应不能恢复私有详情或安装审阅。运行中保存权限会撤销旧代次并重建应用；Node 配置保存同样通过重启生效。Node/完整 SDK 尚在后续批次，不由 staticAvailable 推断。

Node 应用启动受理后显示 starting，通过管理轮询更新健康和错误状态；已运行后端继续低频刷新状态，不建立业务 WS。日志页读取 stdout/stderr 有界尾部，由 owner 手动刷新，输出只作文本显示。静态应用不展示后端日志入口。


安装与生命周期返回 202 operationId，界面轮询受理结果，再刷新应用状态；取消仅停止等待，已受理操作仍由服务处理。保存运行中 Node 配置或权限会创建新 generation，旧会话失效。运行中更新失败恢复旧代码，页面展示错误并读取回退后的实际状态；不自动重放安装或启停。


## 上传与执行

`UploadFileParams` 位于 `shared/data/api/dto/resources.ts`，包含 file、filename、requestId、chatId、sha256、signal。uploadFile 使用 HTTP multipart 发送，平台返回 `{requestId,chatId,upload}`（在 ApiResponse.data 内），通过 extractUploadReferences / extractUploadChatId 转换。Platform 自己计算 sha256；可选 agentKey/name 由 Platform 支持，当前 helper 不发送，见附件上传专题。

`ExecuteRequest` 位于 `dto/execute.ts`，新增可选 `chatId?: string` 与 `references?: unknown[]`，与 Query 的引用表示一致。没有 chatId 时新建 Chat；传入时按 Query 规则复用或创建。引用解析、交互限制与交卷 Schema 由 Platform 校验。

executeAgent 只走同步 HTTP、不走 WS、不自动重试。有 multipart 文件时发送 request JSON 文本字段及文件字段，由浏览器生成 boundary；没有 multipart 文件时发送 JSON，包括已经上传的 references。Platform 拒绝 chatId 与 multipart 文件同时出现；执行测试页将两种附件输入互斥，并省略空 chatId/空 references。

## ACP 项目创建与能力投影

外部项目由现有 agents 创建入口消费 Platform 动态 engineDirectory，保存 engine: acp 和 runtimeConfig.engineId/workspaceRoot；不再提交 Bridge ID、CODER mode 或 Native 模型预算。目录通过现有 transport push/reconnect 信号重读，保留草稿与用户选择；撤销、加载中和加载失败阻止提交，序号守卫丢弃旧响应。Native 模型/规划/权限入口关闭；附件与连接器按配置及实际 ACP 会话能力校验，detail 默认 simple；不在创建表单启动会话。真实 Chat prepare/config 及认证/HITL 界面由 ACP-010 接入。
