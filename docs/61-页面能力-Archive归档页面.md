# Archive归档页面

## 当前状态
Archive 页面由 `/archives` 和 `/archives/:chatId` 路由进入，页面入口是 `src/app/pages/archives/index.tsx`，主体复用 `ArchiveConsole`。它面向归档对话列表、搜索、详情预览、恢复、删除和批量归档操作。

## 核心职责
- 展示归档对话列表，并支持按 agentKey 过滤和加载更多。
- 支持归档搜索、详情读取、事件摘要预览和原始消息开关。
- 支持恢复归档对话、恢复后打开对话、删除归档记录。
- 支持按天数批量归档当前候选对话。

## 核心流程
进入 `/archives` 后，`ArchivesPage` 将路由参数映射为当前选中的 archived chat。`ArchiveConsole` 调用 archives list/search/detail 接口加载数据；恢复或删除后失效 chats 相关缓存并刷新列表。恢复并打开时会跳转回对应 agent 对话路由。

## 边界与非目标
- 归档索引、归档存储和恢复语义由后端负责。
- Archive 页面不维护 Memory records，也不调度 Automation。
- 前端只展示归档详情和操作结果，不修复归档数据内容。

## 相关文件
- `../src/app/pages/archives/index.tsx`
- `../src/features/settings/components/ArchiveConsole.tsx`
- `../src/shared/data/api/client.ts`
- `../src/shared/data/api/routedClient.ts`
- `../src/shared/data/api/endpoints.ts`
- `../src/shared/data/api/client.test.ts`
