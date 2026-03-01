# chat-history 模块 API

## 接口列表
- `GET /api/ap/chat?chatId=...&includeRawMessages=true?`

## 请求参数
| 字段 | 位置 | 必填 | 约束 |
|---|---|---|---|
| `chatId` | query | 是 | 非空 |
| `includeRawMessages` | query | 否 | 仅在调试场景传 `true` |

## 响应结构
成功 `data` 期望字段：
- `events`（前端主消费）
- `rawMessages/messages`（调试可选）

## 失败场景
| 场景 | HTTP | code | msg |
|---|---|---|---|
| `chatId` 无效 | 4xx | 非0或缺失 | 上游返回 |
| 会话不存在 | 404/2xx | 非0或缺失 | 上游返回 |
| 解析失败 | 2xx | 缺失 | `Response is not ApiResponse shape` |

## 幂等性与副作用
- 只读接口，无副作用。

## 异步行为
- 历史事件由数组回放；消费行为应与实时流一致。
