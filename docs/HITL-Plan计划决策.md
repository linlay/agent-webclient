# HITL-Plan计划决策

## 当前状态
Plan awaiting 是用户对计划进行 approve/reject 决策的交互模式，不等同于 `plan.create` 驱动的浮动计划面板。内置计划对话框位于 `features/tools/components/buildin/plan-dialog`。

## 核心职责
- 归一化 awaiting plan 的 id、planningId、title、options 和可选文本输入。
- 渲染计划决策选项，并支持 approve/reject。
- 根据决策同步 planning mode 相关前端行为。
- 构造 plan submit param 并等待 awaiting answer。

## 核心流程
收到 mode 为 plan 的 awaiting ask 后，active awaiting 保存 plan 对象。计划对话框展示 title 与 options，用户选择决策后由 `buildPlanSubmitParam` 生成提交参数。answer 事件确认后清理 active awaiting，并在 timeline 中显示提交结果。

## 边界与非目标
- Awaiting plan 只处理用户决策，不维护任务运行进度。
- 结构化任务进度属于 `计划事件与任务视图.md`。
- 后端是否采纳计划决策由服务端协议决定。

## 相关文件
- `../src/features/tools/lib/awaitingRuntime.ts`
- `../src/features/tools/lib/planDecision.ts`
- `../src/features/tools/components/buildin/plan-dialog/index.tsx`
- `../src/features/tools/components/buildin/plan-dialog/state.ts`
- `../src/features/composer/hooks/useComposerAwaiting.ts`
- `../src/features/composer/components/ComposerArea.tsx`
