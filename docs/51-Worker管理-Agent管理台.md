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

## 结构化编辑布局
右侧结构化编辑器采用无外围边框的扁平分组，路径下方提供五个吸顶锚点；源文件编辑模式不显示这些锚点。已有来源路径既可以直接点击，也可以通过路径右侧的文件夹按钮调用注册目录接口，在访达中打开当前 Agent 的配置目录（`directoryType: config`），不打开 workspace。

- 基本属性：Key、名称、角色、模式、图标、可见性和描述。其中可见性、描述各占完整一行。
- 模型配置：Model Key、启用思考和思考强度；思考字段继续根据模型能力条件显示。
- 上下文与能力：上下文标签、工具、技能都属于同一个区域，并各占完整一行。
- 高级配置：控制、运行时配置、记忆配置、预算，以及仅在 ACP-PROXY 模式显示的代理配置。
- 提示词：Greetings、Wonders、`SOUL.md`、`AGENTS.md`，均占完整一行。Greetings 与 Wonders 使用可增删的字符串列表编辑器，保存时清理空白项，清空后删除定义字段。

桌面端普通短字段按三列排列，长文本与字符串列表保持完整行宽；上下文标签使用普通列宽，工具和技能仍各占完整一行。窄屏下表单切换为单列，锚点保持单行并支持横向滚动。分组只通过标题、图标、留白和目标高亮建立层级，不使用卡片边框或标题背景。

编辑态始终只显示一个保存按钮：结构化编辑且显示吸顶锚点时，保存入口位于锚点栏最右侧；没有吸顶锚点的源文件编辑态则放在删除按钮右侧。锚点链接由独立的横向滚动容器承载，吸顶栏使用不透明背景和独立层级，避免下方输入控件滚动时覆盖锚点或保存按钮。内容滚动会同步切换当前锚点，滚动到底部时固定选中“提示词”；窄屏中当前锚点也会自动滚入锚点栏的可见范围。创建态仍在表单底部显示“创建智能体”。

结构化表单或源文件发生修改后，切换智能体、进入新建、切换编辑方式以及关闭 Agent 管理弹窗都会先确认是否放弃修改；保存、成功加载其他智能体或确认重置后清除脏状态。页面刷新或关闭时也会触发浏览器原生的未保存离开提醒。

## 边界与非目标
- Agent 管理台编辑的是后端 agent 定义，不负责运行中的 query stream。
- Registry 文件编辑不在 Agent 管理台内完成。
- 前端只展示后端诊断，不自行判定 YAML 或 agent 能力是否有效。

## 相关文件
- `../src/app/pages/agents/index.tsx`
- `../src/features/workers/components/AgentConsole.tsx`
- `../src/features/workers/lib/agentSummary.ts`
- `../src/features/workers/lib/agentOrdering.ts`
- `../src/shared/data/api/client.ts`
- `../src/shared/data/api/routedClient.ts`
