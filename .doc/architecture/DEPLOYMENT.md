# 部署架构与环境

## 1. 启动方式
- 本地开发：`npm run dev`
- 本地测试：`npm test`
- 本地构建：`npm run build`
- 本地预览：`npm run preview`
- 容器启动：`docker compose up -d --build`

## 2. 核心环境变量
| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `AGENT_API_TARGET` | `http://127.0.0.1:11949` | Vite 代理上游地址 |
| `PORT` | `11948` | dev server 端口 |
| `PREVIEW_PORT` | `4173` | preview 端口 |
| `AGENT_WEBCLIENT_PORT` | `11948` | 容器映射端口（compose 场景） |
| `AGENT_API_UPSTREAM` | `http://host.docker.internal:11949` | Nginx 反向代理上游 |

## 3. 代理与流式配置
1. `/api/ap/` 需要代理到上游 AGENT API。
2. Nginx 对 SSE 必须关闭缓冲（例如 `proxy_buffering off`）。
3. `/api/ap/query` 响应类型必须为 `text/event-stream`。

## 4. 运行目录约定
- 源仓根目录：构建与开发命令入口
- `release/`：打包产物目录
- `release/frontend/dist`：前端静态资源

## 5. 部署验收清单
1. 页面可访问：`http://localhost:<PORT>`
2. token 为空时触发强校验与弹窗。
3. `agents/chats/chat/query/viewport/submit` 请求可达。
4. SSE 场景可连续收到事件直到 `run.complete|run.error|run.cancel`。
