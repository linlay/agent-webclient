# Memory页面

## 当前状态
Memory 页面由 `/memory` 路由进入，页面入口是 `src/app/pages/memory/index.tsx`，主体复用 `MemoryInfoConsole`。它面向 agent 记忆记录、scope 偏好、上下文预览和保存校验等管理操作。

## 核心职责
- 展示 memory records，并支持按 keyword、kind、scope、status、category 筛选。
- 展示 memory scopes、scope detail、memory meta 和当前偏好来源。
- 维护 preference markdown / records draft、脏状态、校验结果和保存结果。
- 提供 context preview，用于观察指定 chat/message 下的记忆注入效果。

## 核心流程
进入 `/memory` 后，`useMemoryRecordsInitialization` 根据当前 agent 上下文初始化 records。用户切换 scope 或选择记录时，控制台通过 data client 拉取 detail；编辑 preference 时先维护本地 draft，保存前可调用 validate，保存成功后失效 memory meta 缓存并刷新相关状态。

## 边界与非目标
- Memory 存储、embedding、召回、合并和权限由后端负责。
- Memory 页面不处理会话归档和自动化调度，它们分别属于 Archive 与 Automation 专题。
- Memory 功能入口受 `MEMORY_ENABLED` 控制。

## 相关文件
- `../src/app/pages/memory/index.tsx`
- `../src/features/settings/components/MemoryInfoModal.tsx`
- `../src/features/settings/hooks/useMemoryRecordsInitialization.ts`
- `../src/features/settings/lib/memoryInfo.ts`
- `../src/shared/data/memoryTypes.ts`
- `../src/shared/data/client.ts`
