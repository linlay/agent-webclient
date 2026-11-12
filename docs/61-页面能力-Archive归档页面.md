# Archive归档页面

## 当前状态
Archive 页面由 `/archives` 和 `/archives/:chatId` 路由进入，页面入口是 `src/app/pages/archives/index.tsx`，主体复用 `ArchiveConsole`。它面向归档对话列表、搜索、详情预览、恢复、删除和批量归档操作。

Archive 是独立 `features/archive` 领域，不归 Settings。现有组件/runtime/view-model 分层保持不变：Console 负责编排，List/Detail Pane 负责展示，`useArchiveRuntime` 负责加载与写操作，`archiveViewModel` 保持 React-free。

## 核心职责
- 展示归档对话列表，并支持按 agentKey 过滤和加载更多。
- 详情按对话时间线呈现归档内容，不提供原始事件视图。
- 支持恢复归档对话、恢复后打开对话、删除归档记录。
- 支持按天数批量归档当前候选对话。

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
