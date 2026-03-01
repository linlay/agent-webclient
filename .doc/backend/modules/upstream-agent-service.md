# upstream-agent-service 边界说明

## 模块职责
- 负责：提供 `/api/ap/*` 协议能力与事件流。
- 不负责：前端状态管理、DOM 渲染、浏览器动作执行。

## 对接契约
1. 非流式接口遵循统一壳 `code/msg/data`。
2. `POST /api/ap/query` 提供 `text/event-stream`。
3. 工具链路提供 `viewport` 获取与 `submit` 回传。

## 不可推断项
- 内部模块划分
- 数据库模型
- 任务编排算法

## 升级约束
- 若接口字段或事件语义变更，应先更新 `.doc/api/*` 并记录 changelog。
