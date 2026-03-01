# API 模块模板

# <module-name> 模块 API

## 接口列表
- `<METHOD> /api/ap/<resource>`

## 请求参数
| 字段 | 位置/类型 | 必填 | 约束 |
|---|---|---|---|
| `<field>` | `<location-or-type>` | `<required>` | `<rule>` |

## 响应结构
成功：
```json
{
  "code": 0,
  "msg": "success",
  "data": {}
}
```

## 失败场景
| 场景 | HTTP | code | msg |
|---|---|---|---|
| `<case>` | `<http-status>` | `<biz-code>` | `<message>` |

## 幂等性与副作用
- `<idempotency-and-side-effects>`

## 异步行为
- `<async-behavior>`
