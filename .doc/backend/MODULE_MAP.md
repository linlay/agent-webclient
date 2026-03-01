# 后端依赖模块地图（边界版）

> 本仓库是前端消费方，不描述上游内部包结构。

## 1. 外部模块职责矩阵
| 外部能力 | 前端依赖路径 | 前端用途 |
|---|---|---|
| Agent 列表 | `GET /api/ap/agents` | Agent 选择/展示 |
| Chat 列表 | `GET /api/ap/chats` | 会话侧栏 |
| Chat 历史 | `GET /api/ap/chat` | 历史回放 |
| Query SSE | `POST /api/ap/query` | 实时交互 |
| Viewport | `GET /api/ap/viewport` | 前端工具 iframe |
| Submit | `POST /api/ap/submit` | 工具参数回传 |

## 2. 依赖方向
- Frontend 仅依赖公开 HTTP/SSE 契约，不依赖后端内部实现。
- 契约变更必须先体现在 `.doc/api/*`。

## 3. 禁止跨层行为
1. 禁止在前端文档推断后端内部类/包/存储结构。
2. 禁止将后端未声明字段写入“稳定契约”。
