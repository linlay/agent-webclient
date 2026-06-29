# Reasoning与Planning节点

## 当前状态
Reasoning 与 Planning 是 timeline 中的可展开思考/规划节点。Reasoning 处理 `reasoning.*` 事件，Planning 处理 `planning.*` 事件；二者共享部分 reasoning node 映射和自动折叠逻辑，但语义不同。

## 核心职责
- 处理 reasoning start/delta/end/snapshot，累积文本并更新状态。
- 处理 planning start/delta/end/snapshot，生成 planning timeline node。
- 支持默认展开、自动折叠和任务绑定。
- 在 content 和 tool 之外保留模型中间过程可观测性。

## 核心流程
事件处理器根据 reasoningId、planningId 或 runId 解析稳定 node key，创建或更新对应 timeline node。渲染层使用 ThinkingBlock 和 planning 组件展示文本、状态和展开控制。

## 边界与非目标
- Planning 节点不是 PlanPanel；它展示规划文本流，PlanPanel 展示结构化 plan/task 事件。
- Reasoning 内容是否存在、是否完整由后端和模型决定。
- 自动折叠只影响 UI，不改变事件历史。

## 相关文件
- `../src/features/timeline/lib/eventProcessorReasoning.ts`
- `../src/features/timeline/lib/eventProcessorPlanning.ts`
- `../src/features/timeline/lib/reasoningAutoCollapse.ts`
- `../src/features/timeline/components/ThinkingBlock.tsx`
- `../src/features/timeline/components/planning/index.tsx`
- `../src/app/state/timelineTypes.ts`

