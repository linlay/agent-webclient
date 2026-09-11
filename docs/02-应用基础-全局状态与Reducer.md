# 全局状态与Reducer

## 当前状态
全局状态仍通过 `src/app/state/AppContext.tsx` 暴露 `useAppState`、`useAppDispatch` 和 provider，但状态所有权已经下沉到领域。`agents`、`workers`、`chats`、`conversation`、`timeline`、`tools`、`plan`、`memory`、`voice` 等模块分别在 `lib/<domain>State.ts` 导出 State、Action、初始状态和单领域 reducer；`app/state` 只组合这些契约。

## 核心职责
- 保持原有扁平字段名、reducer 行为和持久化 wire shape，不引入嵌套 slice 或新状态库。
- 将后端事件处理结果转为可渲染的前端状态。
- 单领域 action 优先由所属 feature reducer 处理；同时修改多个领域的协调 action 继续由 app root reducer 处理。
- 管理定时器句柄、运行中工具态和 pending steer 等临时运行态。

## 核心流程
`types.ts` 通过交叉类型组合扁平 `AppState`，`actions.ts` 组合领域 action union，`state.ts` 合并各领域 `createInitialXxxState`，`reducer.ts` 编排领域 reducer 与跨领域协调 reducer。各 feature hook 仍通过统一 dispatch 发送 action；流式事件先由 events 投影为 `EventCommand`，再更新 `timelineNodes`、`toolStates`、`artifacts`、`planRuntimeByTaskId` 等字段。

AGENT wire event、awaiting 和 usage 协议类型位于 `src/shared/contracts/agentEvents.ts`，可供 transport、events 和 tools 共同依赖。业务生产代码不再从 `@/app/state/types` 获取领域类型。

## 边界与非目标
- reducer 不发起网络请求，也不直接操作 DOM。
- AppState 是前端渲染状态，不等同于后端存储模型。
- 新增状态先确定领域所有者，并在对应 `lib/<domain>State.ts` 增加 State、Action、初始值和 reducer；`types.ts` 不作为领域 barrel，也不 re-export 领域类型。
- `npm run check:boundaries` 会阻止 app/state 之外的生产代码重新导入 `@/app/state/types`。

## 相关文件
- `../src/app/state/AppContext.tsx`
- `../src/app/state/provider.tsx`
- `../src/app/state/state.ts`
- `../src/app/state/reducer.ts`
- `../src/app/state/domainReducers.ts`
- `../src/app/state/types.ts`
- `../src/shared/contracts/agentEvents.ts`
- `../src/features/conversation/lib/conversationState.ts`
- `../src/features/timeline/lib/timelineState.ts`
- `../src/features/tools/lib/toolsState.ts`
