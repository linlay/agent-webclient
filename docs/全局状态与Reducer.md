# 全局状态与Reducer

## 当前状态
全局状态集中在 `src/app/state/`，由 `AppContext.tsx` 暴露 `useAppState`、`useAppDispatch` 和上下文 provider。状态类型拆分为 navigation、timeline、tool、voice、ui 等领域，再由 `reducer.ts` 和多个 domain reducer 归并。

## 核心职责
- 保存 agents、teams、chats、当前 run、streaming、timeline、tools、plan、voice、modal 和设置态。
- 将后端事件处理结果转为可渲染的前端状态。
- 提供会话重置、导航切换、时间线更新、语音状态和 UI 面板状态的统一入口。
- 管理定时器句柄、运行中工具态和 pending steer 等临时运行态。

## 核心流程
各 feature hook 通过 dispatch 发送 action，reducer 根据 action 类型更新状态。流式事件先被 timeline event processor 转为 `EventCommand`，再经 `eventDispatchHandlers` 派发为 App action，最终更新 `timelineNodes`、`toolStates`、`artifacts`、`planRuntimeByTaskId` 等状态片段。

## 边界与非目标
- reducer 不发起网络请求，也不直接操作 DOM。
- AppState 是前端渲染状态，不等同于后端存储模型。
- 新增跨模块状态时优先拆到已有领域类型文件，避免把所有字段堆回 `types.ts`。

## 相关文件
- `../src/app/state/AppContext.tsx`
- `../src/app/state/provider.tsx`
- `../src/app/state/state.ts`
- `../src/app/state/reducer.ts`
- `../src/app/state/domainReducers.ts`
- `../src/app/state/types.ts`

