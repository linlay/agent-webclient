# 接口规范（含错误处理）

## 1. 基础协议
- Base Path: `/api/ap`
- 非流式格式：`application/json; charset=UTF-8`
- 流式格式：`text/event-stream`
- 鉴权：见 `AUTH.md`

## 2. 边界声明（frontend-only）
- 本仓库仅消费 `/api/ap/*`，不定义后端内部实现语义。
- 契约冲突统一进入 `[DOC-GAP]` 流程处理，不在代码中拍板。

## 3. 统一响应壳
成功：
```json
{
  "code": 0,
  "msg": "success",
  "data": {}
}
```

失败：
```json
{
  "code": <error-code>,
  "msg": "<error-message>",
  "data": {}
}
```

## 4. 状态码与业务码映射
| 场景 | HTTP | code | 处理 |
|---|---|---|---|
| 成功 | `2xx` | `0` | 正常消费 |
| HTTP 失败 | `非2xx` | 任意/缺失 | 抛 `ApiError` |
| 业务失败 | `2xx` | `!=0` | 抛 `ApiError` |
| 壳结构非法 | `2xx` | 缺失 | 抛 `ApiError` |

## 5. 参数通用约束
1. 发送 `undefined/null/''` 字段时可省略。
2. `chatId`、`runId`、`toolId` 视为不可空业务主键。
3. `includeRawMessages` 为布尔语义 query 参数（`true` 时传入）。

## 6. 流式接口基础约束
1. `POST /query` 返回 `text/event-stream`。
2. SSE 帧需可解析为 JSON 事件对象。
3. 终止事件：`run.complete`、`run.error`、`run.cancel`。
4. 解析异常必须进入 debug 日志并结束当前消费。

## 7. SSE 失败处理统一准则
1. SSE 建链失败：按 HTTP 失败处理并抛 `ApiError`。
2. SSE 帧解析失败：记录 debug，终止当前流，保持 UI 状态可见。
3. 若历史回放与实时流出现语义分叉，标记 `[DOC-GAP]` 后再调整实现。

## 8. `[DOC-GAP]`：错误码分段策略缺失
- 影响路径：`.doc/api/SPEC.md`、`.doc/api/modules/*.md`
- 现状：当前仅能确认 `code=0` 为成功，`code!=0` 统一视为失败。
- 风险：无法稳定映射错误类别（认证、参数、上游故障等）。
- 候选方案：
  - 方案 A（默认）：文档先固化 0/非0 二分规则。
  - 方案 B：上游发布错误码分段规范后回填。
