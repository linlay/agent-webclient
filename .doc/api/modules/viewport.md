# viewport 模块 API

## 接口列表
- `GET /api/ap/viewport?viewportKey=...`

## 请求参数
| 字段 | 位置 | 必填 | 约束 |
|---|---|---|---|
| `viewportKey` | query | 是 | 非空 |

## 响应结构
成功 `data` 期望字段：
- `html`：iframe 渲染内容

## 失败场景
| 场景 | HTTP | code | msg |
|---|---|---|---|
| `viewportKey` 缺失/无效 | 4xx/2xx | 非0或缺失 | 上游返回 |
| 视图不存在 | 404/2xx | 非0或缺失 | 上游返回 |

## 幂等性与副作用
- 只读接口；前端侧副作用为刷新 iframe 内容。

## 异步行为
- 通常由 `tool` 事件触发调用。
