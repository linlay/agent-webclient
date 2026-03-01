# event-stream 事件契约

## 1. 事件类别
- 运行：`request.query`、`run.start`、`run.complete`、`run.error`、`run.cancel`
- 计划：`plan.update`、`task.start`、`task.complete`、`task.cancel`、`task.fail`
- 推理：`reasoning.start|delta|snapshot|end`
- 内容：`content.start|delta|snapshot|end`
- 工具：`tool.start|args|snapshot|result|end`
- 动作：`action.start|args|snapshot|end`

## 2. 消费入口
- 统一入口：`handleAgentEvent(event, source)`
- `source`: `live | history`

## 3. 顺序与约束
1. `run.start` 之后进入运行期，允许多类事件交错出现。
2. `tool.*`、`action.*` 需同步进入 Debug `Tools/Actions` 只读面板。
3. `action.*` 参数齐备后触发浏览器侧执行，`actionId` 幂等执行一次。
4. `run.complete|run.error|run.cancel` 结束 streaming 并清理工具覆盖层。

## 4. 失败处理
1. 未识别事件：记录 debug，不得静默丢弃。
2. 事件解析异常：记录 debug 并按 run 状态执行收敛。
3. 历史回放与实时流发生语义分叉时，标注 `[DOC-GAP]` 并阻断新增实现。

## 5. `[DOC-GAP]` 事件字段细节
- 当前仅固定“事件名与消费行为”，未穷举每类 event payload 字段。
- 若需要字段级稳定契约，须与上游统一后补充字段表。
