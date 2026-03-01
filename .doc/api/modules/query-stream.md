# query-stream 模块 API

## 接口列表
- `POST /api/ap/query`

## 请求参数
| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `message` | string | 是 | 非空文本 |
| `agentKey` | string | 否 | 可由 `@mention` 推导 |
| `chatId` | string | 否 | 续聊时携带 |
| `role` | string | 否 | 透传字段 |
| `references` | array | 否 | 透传字段 |
| `params` | object | 否 | 透传字段 |
| `scene` | string | 否 | 透传字段 |
| `stream` | boolean | 否 | 流式开关 |

## 响应结构
- 响应类型：`text/event-stream`
- 每个 SSE 帧为 JSON 事件对象，事件定义见 `event-stream.md`

## 失败场景
| 场景 | HTTP | code | msg |
|---|---|---|---|
| token 缺失（前端拦截） | N/A | N/A | 发送被阻断 |
| 鉴权失败 | 401/403 | 非0或缺失 | 上游返回 |
| 流建立失败 | 4xx/5xx | 非0或缺失 | 上游返回 |
| SSE 解析失败 | 2xx | N/A | debug 记录并中断 |

## 幂等性与副作用
- 非幂等：每次请求都会创建新的 run。
- 副作用：更新 `runId/streaming/timeline/tool/action` 运行态。

## 异步行为
1. `run.start` 后进入 streaming。
2. 期间消费 `reasoning/content/tool/action/plan/task` 相关事件。
3. `run.complete|run.error|run.cancel` 终止 streaming。

## 事件顺序与终止条件
- 终止条件固定：`run.complete|run.error|run.cancel`
- 允许中间穿插：`tool.*`、`action.*`、`plan.update`、`task.*`
