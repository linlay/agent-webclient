# Memory归档与Automation页面

## 当前状态
Memory、Archive 和 Automation 是独立页面/模态能力，主要由 `src/app/pages/*`、`src/features/settings/` 和 `src/shared/data/memoryTypes.ts` 支撑。前端负责展示、筛选、编辑偏好、预览上下文和触发后端接口。

## 核心职责
- Memory 页面展示 records、scopes、preference draft 和 context preview。
- Archive 页面展示归档会话、搜索、恢复和删除。
- Automation 页面展示自动化列表、详情、执行记录和启停。
- Settings modal 提供 memory info、archive modal 和语音/传输设置入口。

## 核心流程
页面或模态打开时通过 data client 拉取对应 server-state。用户编辑 memory preference 后先在前端 draft 中维护，保存时提交到后端。Archive 和 Automation 操作完成后失效相关缓存并刷新列表。

## 边界与非目标
- Memory 存储、embedding、归档索引和 automation 调度由后端负责。
- 前端不生成自动化执行计划，只展示和提交用户操作。
- Memory 功能入口受 `MEMORY_ENABLED` 控制。

## 相关文件
- `../src/app/pages/memory/index.tsx`
- `../src/app/pages/archives/index.tsx`
- `../src/app/pages/automations/index.tsx`
- `../src/features/settings/components/MemoryInfoModal.tsx`
- `../src/features/settings/components/ArchiveConsole.tsx`
- `../src/shared/data/memoryTypes.ts`

