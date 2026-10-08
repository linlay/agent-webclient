# Agent管理台

## 当前状态
Agent 管理台由 `/agents` 路由进入，页面壳层为 `src/app/pages/agents/index.tsx`，主体由 `src/features/agents` 对外提供。它面向 agent 定义查看、创建、编辑、排序、删除、ZIP 导入、专属 Skill 和源码编辑等管理操作；`features/workers` 不再包含管理台实现。

## 核心职责
- 展示 agent 列表、状态、来源路径、诊断信息和可编辑详情。
- 支持 admin agent 详情、创建、更新、删除和排序。
- 为 CODER agent 提供 workspace、runtimeConfig、模型配置等编辑入口。
- 与左侧 worker 数据保持一致，写操作后刷新相关缓存。

## 核心流程
进入 `/agents` 后，路由参数决定选中 agent。`AgentConsole` 使用 data client 拉取 admin agents、详情和 editor options。排序继续向 `/api/admin/agents/order` 提交包含 invalid Agent 的完整管理 catalog；普通客户端使用的 `/api/agents/order` 不替代管理接口。保存或删除后调用对应 admin API，并失效 agents/model options 缓存。

`AgentConsole` 只编排页面状态、请求生命周期、脏状态保护和各编辑 surface；`AgentListPane` 负责筛选、选择与拖拽排序，`AgentEditor` 负责结构化表单，`AgentCapabilitiesEditor` 负责 Context/Tool/Skill，`AgentSourceEditor` 负责源码，`AgentCreateModal` 与 `useAgentImport` 负责直接创建和 ZIP 导入。表单与后端 definition 的归一化、校验和双向映射集中在 React-free 的 `lib/agentDefinition.ts`。

## 连接器与工具分层

已有 Agent 在“上下文与能力”中通过 `/api/admin/agent` 的 `connectorBindings` 读取预置、声明和实际生效挂载的并集，使用 `/api/admin/connectors` 的 `tools` 展示连接器名称、说明、归属工具和能力。连接器默认收起，点击或键盘展开后显示工具名称、说明及搜索（超过 8 项），CLI、VIEW、技能和 MCP 同步状态分别解释。预置带锁且只读；未生效、等待重载、目录缺失和空列表有独立状态。切换 Agent、目录更新和页面重新可见时刷新，并忽略旧请求响应。MCP 服务按 agentKey 过滤，避免显示其他 Agent 的工具。

自身工具区不重复展示连接器原生工具或 MCP 工具；原生归属来自目录 `nativeTools`，不按工具名前缀推断。平台预置和运行时依赖默认折叠，保留 excluded/active 与只读标识。显示分组不修改 `definition.toolConfig.tools`，保存仍仅使用自身声明，不把自动挂载写回源码。连接器包详情仍在 `/connectors` 查看；两套挂载 PUT 均由后端拒绝修改预置。

## 新建与 ZIP 导入

工具栏加号和空列表“创建智能体”统一打开专用新建弹窗。弹窗提供“ZIP 包导入”和“直接新增”两个页签，默认进入 ZIP 导入；直接新增确认后关闭弹窗并进入原有结构化创建表单，不改变 `/api/admin/agents/create` 契约。真正进入直接新增或提交 ZIP 前才执行现有未保存修改确认，取消后保留当前编辑状态。

ZIP 页签支持拖放、文件选择和更换，前端先校验 `.zip`、非空及 32 MiB 上限。页面不显示或发送 Agent ID；ID 固定由 Platform 从包内 `agent.yml` / `agent.yaml` 读取。说明区明确 ZIP 可以携带 prompt、专属 Skills、`.config`、知识文件和其他资源，且 `.config` 可能包含敏感内容，只应上传可信包。

`importAdminAgent` 以 multipart `file` 和可选 `overwrite` 调用 `POST /api/admin/agents/import`。首次提交不发送 `overwrite`；收到 409 且 `data.error.overwriteRequired=true` 时，弹出二次危险确认，说明旧 `.config`、专属 Skills 和资源将被整目录替换。确认后复用同一个 `File` 并以 `overwrite=true` 重试，取消则保留原编辑状态和已选文件。422 的文件级 diagnostics 在弹窗内展示。

导入成功后刷新 admin 列表和全局 Agent 缓存，并选中导入 Agent。`status: ready` 显示成功提示；`status: invalid` 显示警告但仍关闭弹窗、切换并保留管理台诊断，方便继续修复。覆盖不会触碰既有 chat、archive 或已经启动的 session，这些运行时边界由 Platform 保证。

## 结构化编辑布局
右侧详情采用面向个人配置的简化形态：无详情大头部，也不展示来源路径、Key 等技术信息；五个顶部页签直接位于详情顶部，每次只展示当前配置面板。页签使用标准 tab/tabpanel 语义，支持左右方向键、Home 和 End 切换；源码编辑或不可结构化编辑时页签栏只保留右侧操作区。新建 Agent 的稳定 Key 由前端内部生成，不暴露技术字段。
- 基本属性：名称、角色、图标、模式、可见性和描述。模式使用平铺单选，可见性使用平铺多选，不需要先打开下拉框；二者与描述各占完整一行。
- 模型配置：通过统一模型菜单选择 Model Key，并按模型能力展示可用的思考强度。
- 上下文与能力：上下文标签、连接器、自身工具、技能都属于同一个区域，并各占完整一行。
- 高级配置：控制、运行时配置、记忆配置、预算，以及仅在 ACP-PROXY 模式显示的代理配置。当前统一使用 JSON 文本域承载，未引入结构化规则编辑器或额外调试 API。
- 提示词：Greetings、Introductions、Wonders、`SOUL.md`、`AGENTS.md`，均占完整一行。Greetings（主标题问候语）、Introductions（输入框自我介绍）与 Wonders（推荐问题）以逐条输入框编辑，按数组回写，不裁剪数组项或改变原有字段关系；`SOUL.md`、`AGENTS.md` 使用普通文本域。

基本属性按原型拆为“身份信息”和“运行方式”：身份区左侧为大图标预览与按需展开的图标设置，右侧为名称、角色和描述；运行方式包含平铺模式与可见性。两组卡片只显示图标、名称与选择状态，简短说明仅在 hover 或键盘聚焦时显示；模式组直接关联“运行方式”标题，不重复显示“模式”字段标题。其余页签保留轻量分区和完整字段关系。桌面端普通短字段按三列排列，长文本保持完整行宽；工具和技能各占完整一行。窄屏下身份区和表单切换为单列，页签保持单行并支持横向滚动。分组只通过标题、留白和单条分隔线建立层级，不使用卡片边框或标题背景；平铺选项默认使用无边框浅底，仅为选中项提供强调描边。

编辑态的操作统一收进吸顶页签栏右侧（与 Automations 一致）：源码切换与删除为紧凑图标按钮（删除带二次确认），保存为「图标 + 文字」按钮——结构化编辑显示「保存」，源码编辑显示「保存源文件」，创建态显示「创建智能体」且表单底部不再重复出现创建按钮（编辑态表单底部仅保留「取消编辑」）。页签由独立横向滚动容器承载，栏位使用不透明背景和独立层级；窄屏中当前页签自动滚入可见范围。

结构化表单或源文件发生修改后，切换智能体、进入新建、切换编辑方式以及关闭 Agent 管理弹窗都会先确认是否放弃修改；保存、成功加载其他智能体或确认重置后清除脏状态。页面刷新或关闭时也会触发浏览器原生的未保存离开提醒。

## 专属技能

已保存的目录型 Agent 可在“技能”行导入 ZIP 形式的专属 Skill。页面不要求手填 ID，后端从 ZIP 的 `SKILL.md` frontmatter 读取 `id`（兼容旧 `key`，都没有则 `name`）。导入自动启用，文件只属于当前 Agent；下拉选项使用简短的“名称 · 技能中心”或“名称 · 专属”标签，专属管理行以“[专属] 名称”显示且危险按钮只写“删除”。导入请求不查询技能中心，同 ID 技能中心版本不会阻止导入；运行时仅当前 Agent 优先使用专属版本。Select 标签的移除只停止启用，文件仍可再次启用；真实删除必须点击专属 Skill 行的危险操作并二次确认。新建 Agent、非目录 Agent、有未保存修改或正在执行保存/删除时，导入入口禁用。页面不提供专属 Skill 的文件树编辑，也不在基础属性中追加目录操作。

## 边界与非目标
- Agent 管理台编辑的是后端 agent 定义，不负责运行中的 query stream。
- 专属 Skill 不属于技能中心，不在技能中心页面展示、编辑或删除。
- Registry 文件编辑不在 Agent 管理台内完成。
- 模型、reasoning 和 service tier 菜单由 `features/model-config` 唯一提供，Composer 与 Agent 管理台不得维护重复 presenter。
- 前端只展示后端诊断，不自行判定 YAML 或 agent 能力是否有效。
- 本次不提供 Agent ZIP 导出、自动改名或客户端填写导入 Key。

## 相关文件
- `../src/app/pages/agents/index.tsx`
- `../src/features/agents/components/AgentConsole.tsx`
- `../src/features/agents/components/AgentEditor.tsx`
- `../src/features/agents/components/AgentCapabilitiesEditor.tsx`
- `../src/features/agents/components/AgentSourceEditor.tsx`
- `../src/features/agents/components/AgentCreateModal.tsx`
- `../src/features/agents/hooks/useAgentImport.ts`
- `../src/features/agents/lib/agentDefinition.ts`
- `../src/features/agents/lib/agentOrdering.ts`
- `../src/features/model-config/components/ModelMenuPresenter.tsx`
- `../src/features/model-config/lib/modelOptions.ts`
- `../src/shared/data/api/http.ts`
- `../src/shared/data/api/routedClient.ts`

## 对话辅助入口

手工创建、编辑、保存与对话方式并存。独立的「通过对话创建／修改」入口使用默认 Chat 智能体，预选 `platform-admin` 并填写草稿，不自动发送。保留原有表单、源码编辑、ZIP 导入及只读边界；连接器手工新增沿用 ZIP 导入。详见[资源对话创建与修改](01-应用基础-应用入口路由与布局壳层.md#资源对话创建与修改)。

项目创建由客户端把选中功能展开为具体 definition JSON，复用 `/api/admin/agents/create` 并传请求级 `isProject:true`；用户目录写入 `definition.runtimeConfig.workspaceRoot`，由 Platform 在写盘前校验为具体、现存且非系统根的目录。标志不持久化，普通 Agent 创建表单保留原有契约。Platform 提供 creation-defaults 与普通资源目录。Standalone 从 public/agent-creation.json 分发品牌配置；Desktop 内嵌入口通过宿主桥复用环境配置，不回退到 standalone 分组。

管理工具目录 `/api/admin/tools` 仅提供独立工具；Agent 管理详情的 `tools/toolBindings` 同样不包含连接器所属工具，`definition` 保留原始可编辑源码，不为展示分组改写。连接器及 MCP 工具名称、说明直接取连接器管理响应 `tools`，不再与独立工具目录拼接；工具缺少 description 时显示“暂无说明”。新旧服务需配套更新。

管理详情统一读取 `GET /api/admin/agent?agentKey=...`，`connectorBindings` 内含 presetConnectorIds、declaredConnectorIds、connectorIds、activeConnectorIds 和 reloadPending；能力区复用此快照，仅额外读取连接器展示目录。旧详情和挂载 GET 路径由 Platform 保留兼容，前端不再调用；挂载 PUT 路径不变。无效源码无法解析挂载时可缺省 connectorBindings，仍保留诊断与源码编辑。
