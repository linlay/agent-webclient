# Memory页面

## 当前状态
Memory 页面由 `/memory` 路由进入，页面入口是 `src/app/pages/memory/index.tsx`，主体复用 `MemoryInfoConsole`。Memory 是独立 feature，不属于 Settings；页面和全局 Modal 使用同一控制台能力，但拥有独立的打开、初始化、关闭重置生命周期。

## 核心职责
- 展示 memory records，并支持按 keyword、kind、scope、status、category 筛选。
- 展示 memory scopes、scope detail、memory meta 和当前偏好来源。
- 维护 preference markdown / records draft、脏状态、校验结果和保存结果。
- 提供 context preview，用于观察指定 chat/message 下的记忆注入效果。

## 核心流程
进入 `/memory` 后，`useMemoryRecordsInitialization` 根据当前 agent 上下文初始化 records。`MemoryConsole` 只编排 tab、runtime 与 surface，Records、Preferences、Preview 的真实 JSX 分别位于独立 Panel 文件。用户切换 scope 或选择记录时，控制台通过 data client 拉取 detail；编辑 preference 时先维护本地 draft，保存前可调用 validate，保存成功后失效 memory meta 缓存并刷新相关状态。

侧栏通过独立 `onOpenMemory` 动作打开 `MemoryOverlayProvider`；`ShellOverlays` 组合 `MemoryOverlayHost`，再由 `MemoryModal` 渲染 `MemoryInfoConsole` 的 modal surface。关闭 Modal 时由 `MemoryOverlayProvider` 执行 `RESET_MEMORY_INFO_SESSION`，Settings Provider 不再持有 Memory key 或生命周期。

## 边界与非目标
- Memory 存储、embedding、召回、合并和权限由后端负责。
- Memory 页面不处理对话归档和自动化调度，它们分别属于 Archive 与 Automation 专题。
- Memory 功能入口受 `MEMORY_ENABLED` 控制。
- Settings Provider 只管理 Settings，不得代理 Memory open/reset。

## 相关文件
- `../src/app/pages/memory/index.tsx`
- `../src/features/memory/components/MemoryModal.tsx`
- `../src/features/memory/components/MemoryConsole.tsx`
- `../src/features/memory/components/MemoryRecordsPanel.tsx`
- `../src/features/memory/components/MemoryPreferencesPanel.tsx`
- `../src/features/memory/components/MemoryPreviewPanel.tsx`
- `../src/features/memory/components/MemoryOverlayProvider.tsx`
- `../src/features/memory/components/MemoryOverlayHost.tsx`
- `../src/features/memory/hooks/useMemoryRecordsInitialization.ts`
- `../src/features/memory/lib/memoryInfo.ts`
- `../src/features/memory/lib/memoryState.ts`
- `../src/shared/data/memory/memoryTypes.ts`
- `../src/shared/data/api/client.ts`
