# chats 模块 API

## 接口列表
- `GET /api/ap/chats`

## 请求参数
- 无

## 响应结构
成功 `data` 期望字段（数组元素）：
- `chatId`
- `chatName`
- `firstAgentName`
- `firstAgentKey`
- `updatedAt`

## 失败场景
| 场景 | HTTP | code | msg |
|---|---|---|---|
| 鉴权失败 | 401/403 | 非0或缺失 | 上游返回 |
| 服务异常 | 5xx | 非0或缺失 | 上游返回 |
| 业务失败 | 2xx | 非0 | 上游返回 |

## 幂等性与副作用
- 只读接口，无副作用。

## 异步行为
- 无。
