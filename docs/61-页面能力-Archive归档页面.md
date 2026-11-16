# Archive归档页面

## 当前状态
Archive 页面由 `/archives` 和 `/archives/:chatId` 路由进入，页面入口是 `src/app/pages/archives/index.tsx`，主体复用 `ArchiveConsole`。它面向归档对话列表、搜索、详情预览、恢复、删除和批量归档操作。

Archive 是独立 `features/archive` 领域，不归 Settings。现有组件/runtime/view-model 分层保持不变：Console 负责编排，List/Detail Pane 负责展示，`useArchiveRuntime` 负责加载与写操作，`archiveViewModel` 保持 React-free。

## 页面布局
- 未选中归档对话时只渲染居中单列：最大宽度 1000px，顶部显示「已归档聊天」标题，其下是工具条与按智能体分组的列表（工具条与列表之间保留 16px 间距）；详情面板与拖拽分隔条都不挂载。没有归档或加载完成仍无结果时，列表区居中展示图标、标题与说明文案，不再使用整条色块背景；首次加载中只显示居中 Spin。
- 选中对话（`/archives/:chatId`）后切换为可拖拽的两栏布局：左侧列表默认 280px、最小 280px，右侧详情。把分隔条拖过视口一半宽度时自动展开为居中列表：详情隐藏、选中高亮保留，再次点击列表项回到两栏布局；详情头部不再提供关闭按钮。
- 工具条一行展示搜索框、筛选按钮和智能体图标按钮；列表收起（分栏窄列表）时筛选按钮只展示图标，并与智能体按钮保持同样的无边框、透明样式；展开时展示图标、文案与计数。智能体按钮位于筛选按钮右侧、无边框，只展示 `agent_type` 图标，点击后打开下拉菜单选择“全部智能体”或具体智能体（已选智能体时按钮高亮）。筛选弹层只保留归档日期、创建日期、最后运行日期与重置。`showAgentFilter` 为 false 的嵌入场景不显示智能体按钮，仍按当前 Worker 限定列表范围。

## 分组与批量操作
列表用 `groupArchivesByAgent` 按 `agentKey` 分组，组内保持接口返回顺序；组按聊天数降序排列，未关联智能体的分组排最后。分组标题显示智能体图标、名称与聊天数（`archive.group.count`），没有匹配的智能体时回退到 agentKey，缺失 agentKey 时显示“未关联智能体”。条目内的智能体字段不再重复展示。

分组始终展开，不提供折叠交互。组头左侧展示 24px 智能体头像与名称，右侧把聊天数和“分组操作”下拉菜单（`archive.group.more`）放在一起，菜单内提供“还原全部”“删除全部”。组头背景透明且不吸顶，随列表内容一起滚动。

列表项只展示最后运行时间，由 `formatArchiveTimestamp` 固定输出到分钟的本地时间（如 `2026-09-10 16:05`），不再显示“最后运行”标签，也不再重复展示创建时间与归档时间；归档时间仍保留在详情面板头部。

列表项操作统一用绝对定位放在行右侧并垂直居中：还原、还原并打开、删除三个图标按钮默认透明且不拦截指针，hover、键盘聚焦时显示，触屏设备（`hover: none`）常驻显示；hover 时用 Tooltip 展示对应文案。宽列表与窄列表使用同一套操作，不再为窄栏保留“更多”菜单。行内按钮会阻止点击事件冒泡，不会同时打开对话。

“还原全部”调用 `restoreArchives({ chatIds })`，逐条回写 `UPSERT_CHAT` 后从列表移除，并提示成功/失败条数。“删除全部”因 `deleteArchive` 只接受单个 chatId，用 `Promise.allSettled` 逐条删除，仅移除确认删除成功的条目，结果文案区分成功与失败。两者都使用 `Modal.confirm` 二次确认；删除确认按钮为危险样式。操作后仍由 `chat.archived` / `archive.restored` / `archive.deleted` 推送与重连信号兜底刷新列表。

## 核心职责
- 展示按智能体分组的归档对话列表，并支持按 agentKey 过滤和加载更多。
- 详情按对话时间线呈现归档内容，不提供原始事件视图。
- 支持恢复归档对话、恢复后打开对话、删除归档记录。
- 支持按智能体分组批量还原/删除，以及按天数批量归档当前候选对话。

## 详情渲染
归档只持久化协议事件，不保存渲染结果。`ArchiveDetailPane` 不再自己拼装事件卡片，而是把 `detail.events` 交给 `buildArchiveConversationData`（`lib/archiveConversation.ts`）用 `buildChatReplayProjection` 走一次与 `/api/chat` 回放相同的投影，再以 `ConversationPreview`（内部即 `ConversationStage`）渲染：用户气泡、Run 分组、“已处理 N”折叠、工具胶囊、Markdown 正文、时间与耗时 meta 都与主对话一致，只是 `TimelineInteractionValue.readOnly` 为 `true`、`conversationActive` 为 `false`，历史 HITL 卡片不可提交，也不会出现流式状态。详情不再提供原始事件视图。

`buildChatReplayProjection` 只在事件带合法 `timestamp` 时才产出节点，因此：

- 有可用事件：按对话时间线渲染。
- 无事件或事件不可回放：回退到 `detail.runs` 的 `initialMessage` / `assistantText`，仍然渲染成用户气泡与助手正文（不带工具、推理与耗时明细）。
- 两者都没有可读内容：显示 `archive.empty.detail`。

详情面板是「头部 + 可选警告 + 内容」的 flex 列，`archive-detail-content` 占满剩余高度并自行滚动，`ConversationStage` 以容器模式（非 window scroll）挂载，列表区域沿用 `Timeline.module.css` 的 840px 居中约束。加载中只显示内容区内的遮罩与 Spin，不先闪一条空态。附件清单不可用时头部下方只插一条 `role="note"` 警告，不阻断正文。

## 核心流程
进入 `/archives` 后，`ArchivesPage` 将路由参数映射为当前选中的 archived chat。`ArchiveConsole` 调用 archives list/search/detail 接口加载数据；恢复或删除后失效 chats 相关缓存并刷新列表。恢复并打开时会跳转回对应 agent 对话路由。

归档与恢复可能由其他 surface 发起（Desktop 侧栏、另一个窗口、批量归档）。`/archives` 是对话壳层的同级路由，页面内没有对话推送处理器，因此 `useArchiveRuntime` 通过 `usePushSignal` 直接订阅 `chat.archived`、`archive.restored`、`archive.deleted`，并用 `useReconnectSignal` 覆盖断线期间漏掉的推送；收到信号后去抖重载列表，选中项已不在新列表时清空选中与详情。

## 边界与非目标
- 归档索引、归档存储和恢复语义由后端负责。
- Archive 页面不维护 Memory records，也不调度 Automation。
- `/archives` 路由名称和后端 archive API 保持不变。
- 前端只展示归档详情和操作结果，不修复归档数据内容。

## 相关文件
- `../src/app/pages/archives/index.tsx`
- `../src/features/archive/components/ArchiveConsole.tsx`
- `../src/features/archive/components/ArchiveListPane.tsx`
- `../src/features/archive/components/ArchiveAgentFilter.tsx`
- `../src/features/archive/components/ArchiveFilter.tsx`
- `../src/features/archive/components/ArchiveDetailPane.tsx`
- `../src/features/archive/hooks/useArchiveRuntime.ts`
- `../src/features/archive/lib/archiveConversation.ts`
- `../src/features/archive/lib/archiveViewModel.ts`
- `../src/features/conversation/components/ConversationPreview.tsx`
- `../src/features/timeline/components/ConversationStage.tsx`
- `../src/shared/data/api/http.ts`
- `../src/shared/data/api/routedClient.ts`
- `../src/shared/data/api/endpoints.ts`
- `../src/shared/data/api/client.test.ts`
