# submit 模块 API

## 接口列表
- `POST /api/ap/submit`

## 请求参数
| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `runId` | string | 是 | 非空 |
| `toolId` | string | 是 | 非空 |
| `params` | object | 是 | 可序列化 JSON |

## 响应结构
- 采用统一响应壳（`code/msg/data`）。

## 失败场景
| 场景 | HTTP | code | msg |
|---|---|---|---|
| 参数不完整 | 4xx/2xx | 非0或缺失 | 上游返回 |
| run/tool 状态不合法 | 4xx/2xx | 非0或缺失 | 上游返回 |
| 鉴权失败 | 401/403 | 非0或缺失 | 上游返回 |

## 幂等性与副作用
- 幂等性由上游定义；前端不做重复提交重放。
- 副作用：工具等待态推进，后续事件继续流入 timeline/debug。

## 异步行为
- 通常在 frontend tool iframe 回传 `frontend_submit` 后触发。
