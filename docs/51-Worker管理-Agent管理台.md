# Agent管理台

## 当前状态
Agent 管理台由 `/agents` 路由进入，页面壳层为 `src/app/pages/agents/index.tsx`，主体为 `AgentConsole`。它面向 agent 定义查看、创建、编辑、排序、删除、打开工作区等管理操作。

## 核心职责
- 展示 agent 列表、状态、来源路径、诊断信息和可编辑详情。
- 支持 admin agent 详情、创建、更新、删除和排序。
- 为 CODER agent 提供 workspace、runtimeConfig、模型配置等编辑入口。
- 与左侧 worker 数据保持一致，写操作后刷新相关缓存。

## 核心流程
进入 `/agents` 后，路由参数决定选中 agent。`AgentConsole` 使用 data client 拉取 admin agents、详情和 editor options。保存或删除后调用对应 admin API，并失效 agents/model options 缓存。

## 新建与 ZIP 导入

工具栏加号和空列表“创建智能体”统一打开专用新建弹窗。弹窗提供“ZIP 包导入”和“直接新增”两个页签，默认进入 ZIP 导入；直接新增确认后关闭弹窗并进入原有结构化创建表单，不改变 `/api/admin/agents/create` 契约。真正进入直接新增或提交 ZIP 前才执行现有未保存修改确认，取消后保留当前编辑状态。

ZIP 页签支持拖放、文件选择和更换，前端先校验 `.zip`、非空及 32 MiB 上限。页面不显示或发送 Agent Key；Key 固定由 Platform 从包内 `agent.yml` / `agent.yaml` 读取。说明区明确 ZIP 可以携带 prompt、专属 Skills、`.config`、知识文件和其他资源，且 `.config` 可能包含敏感内容，只应上传可信包。

`importAdminAgent` 以 multipart `file` 和可选 `overwrite` 调用 `POST /api/admin/agents/import`。首次提交不发送 `overwrite`；收到 409 且 `data.error.overwriteRequired=true` 时，弹出二次危险确认，说明旧 `.config`、专属 Skills 和资源将被整目录替换。确认后复用同一个 `File` 并以 `overwrite=true` 重试，取消则保留原编辑状态和已选文件。422 的文件级 diagnostics 在弹窗内展示。

导入成功后刷新 admin 列表和全局 Agent 缓存，并选中导入 Agent。`status: ready` 显示成功提示；`status: invalid` 显示警告但仍关闭弹窗、切换并保留管理台诊断，方便继续修复。覆盖不会触碰既有 chat、archive 或已经启动的 session，这些运行时边界由 Platform 保证。

## 结构化编辑布局
右侧详情采用面向个人配置的简化形态：无详情大头部，也不展示来源路径、Key 等技术信息；五个顶部页签直接位于详情顶部，每次只展示当前配置面板。页签使用标准 tab/tabpanel 语义，支持左右方向键、Home 和 End 切换；源码编辑或不可结构化编辑时页签栏只保留右侧操作区。新建 Agent 的稳定 Key 由前端内部生成，不暴露技术字段。
- 基本属性：名称、角色、图标、模式、可见性和描述。模式使用平铺单选，可见性使用平铺多选，不需要先打开下拉框；二者与描述各占完整一行。
- 模型配置：Model Key、启用思考和思考强度；思考字段继续根据模型能力条件显示。
- 上下文与能力：上下文标签、工具、技能都属于同一个区域，并各占完整一行。
- 高级配置：控制、运行时配置、记忆配置、预算，以及仅在 ACP-PROXY 模式显示的代理配置。当前统一使用 JSON 文本域承载，未引入结构化规则编辑器或额外调试 API。
- 提示词：Greetings、Wonders、`SOUL.md`、`AGENTS.md`，均占完整一行。Greetings 与 Wonders 以 JSON 数组文本域编辑并按原值回写，不裁剪数组项或改变原有字段关系；`SOUL.md`、`AGENTS.md` 使用普通文本域。

基本属性按原型拆为“身份信息”和“运行方式”：身份区左侧为大图标预览与按需展开的图标设置，右侧为名称、角色和描述；运行方式包含平铺模式与可见性。其余页签保留轻量分区和完整字段关系。桌面端普通短字段按三列排列，长文本保持完整行宽；工具和技能各占完整一行。窄屏下身份区和表单切换为单列，页签保持单行并支持横向滚动。分组只通过标题、留白和单条分隔线建立层级，不使用卡片边框或标题背景；平铺选项默认使用无边框浅底，仅为选中项提供强调描边。

编辑态的操作统一收进吸顶页签栏右侧（与 Automations 一致）：源码切换与删除为紧凑图标按钮（删除带二次确认），保存为「图标 + 文字」按钮——结构化编辑显示「保存」，源码编辑显示「保存源文件」，创建态显示「创建智能体」且表单底部不再重复出现创建按钮（编辑态表单底部仅保留「取消编辑」）。页签由独立横向滚动容器承载，栏位使用不透明背景和独立层级；窄屏中当前页签自动滚入可见范围。

结构化表单或源文件发生修改后，切换智能体、进入新建、切换编辑方式以及关闭 Agent 管理弹窗都会先确认是否放弃修改；保存、成功加载其他智能体或确认重置后清除脏状态。页面刷新或关闭时也会触发浏览器原生的未保存离开提醒。

## 专属技能

已保存的目录型 Agent 可在“技能”行导入 ZIP 形式的专属 Skill。页面不要求手填 Key，后端从 ZIP 的 `SKILL.md` frontmatter 读取 `key`（没有则 `name`）。导入自动启用，文件只属于当前 Agent；下拉选项使用简短的“名称 · 技能中心”或“名称 · 专属”标签，专属管理行以“[专属] 名称”显示且危险按钮只写“删除”。导入请求不查询技能中心，同 Key 技能中心版本不会阻止导入；运行时仅当前 Agent 优先使用专属版本。Select 标签的移除只停止启用，文件仍可再次启用；真实删除必须点击专属 Skill 行的危险操作并二次确认。新建 Agent、非目录 Agent、有未保存修改或正在执行保存/删除时，导入入口禁用。页面不提供专属 Skill 的文件树编辑，也不在基础属性中追加目录操作。

## 边界与非目标
- Agent 管理台编辑的是后端 agent 定义，不负责运行中的 query stream。
- 专属 Skill 不属于技能中心，不在技能中心页面展示、编辑或删除。
- Registry 文件编辑不在 Agent 管理台内完成。
- 前端只展示后端诊断，不自行判定 YAML 或 agent 能力是否有效。
- 本次不提供 Agent ZIP 导出、自动改名或客户端填写导入 Key。

## 相关文件
- `../src/app/pages/agents/index.tsx`
- `../src/features/workers/components/AgentConsole.tsx`
- `../src/features/workers/lib/agentSummary.ts`
- `../src/features/workers/lib/agentOrdering.ts`
- `../src/shared/data/api/client.ts`
- `../src/shared/data/api/routedClient.ts`
