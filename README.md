# AGENT Webclient

AGENT 协议调试前端（Vanilla JS + Vite）。

用于联调与观察：
- `/api/ap/query` SSE 流事件
- `/api/ap/chats`、`/api/ap/chat` 会话与历史回放
- `/api/ap/viewport` 视图渲染
- `/api/ap/submit` 前端工具回传

## 1. 快速启动

### 1.1 环境要求

- Node.js 18+
- 可访问 AGENT 后端 API

### 1.2 安装依赖

```bash
npm install
```

### 1.3 开发模式

```bash
npm run dev
```

默认地址：`http://localhost:11948`

### 1.4 生产构建与预览

```bash
npm run build
npm run preview
```

预览默认地址：`http://localhost:4173`

### 1.5 运行测试

```bash
npm test
```

## 2. 环境变量

- `AGENT_API_TARGET`：Vite 代理上游地址（默认值见 `vite.config.js`）
- `PORT`：开发端口（默认 `11948`）
- `PREVIEW_PORT`：预览端口（默认 `4173`）

示例：

```bash
AGENT_API_TARGET=http://127.0.0.1:8080 PORT=5173 npm run dev
```

## 3. 操作手册

### 3.1 首次进入（Token 必填）

首次打开页面且未设置 token 时：
- 自动弹出 Settings
- `Access Token` 输入框红色高亮
- 状态栏显示错误提示

> Token 仅保存在当前页面内存。刷新页面后必须重新输入。

### 3.2 配置 Access Token

1. 在 Settings 的 `Access Token` 输入框输入原始 token（不含 `Bearer `）。
2. 点击 `应用 Token`。
3. 成功后会自动加载 Agents 和 Chats。

### 3.3 发送消息

- `Enter` 发送，`Shift+Enter` 换行。
- 可用 `@agentKey` 指定 Agent。
- 若未输入 token：发送会被阻断，并再次弹窗红色高亮。
- 流式进行中不可重复发送。
- 前端工具待提交时不可发送普通消息。

### 3.4 会话管理

- `新对话`：重置当前会话上下文
- 点击左侧会话：加载历史事件回放
- `Load Raw Chat`：附带 `includeRawMessages=true` 拉取会话

### 3.5 Debug 面板

右侧有 3 个标签页：

1. `Events`
- 展示事件流
- 点击某条事件会弹出单个小浮窗查看完整 event JSON（始终只有一个浮窗）

2. `Logs`
- 展示原始 debug 日志
- 支持清空

3. `Tools/Actions`
- 只读展示全部 `tool.*` 与 `action.*` 事件
- 不提供参数编辑和手动提交按钮

### 3.6 前端工具流程

当收到前端工具事件（`toolType` in `html/qlc` 且有 `toolKey`）：

1. 输入区切换为 iframe 工具视图。
2. 自动拉取 `/api/ap/viewport?viewportKey=...`。
3. 由 iframe 通过 `frontend_submit` 回传参数。

## 4. Docker 运行

### 4.1 仓库根目录直接启动

```bash
docker compose up -d --build
```

默认端口映射：`11948:80`。

可通过 `.env` 覆盖：

```dotenv
AGENT_WEBCLIENT_PORT=11948
AGENT_API_UPSTREAM=http://host.docker.internal:11949
```

### 4.2 Nginx 代理说明

`nginx.conf` 对 `/api/ap/` 开启了 SSE 相关配置（例如 `proxy_buffering off`），用于保证流式事件实时透传。

## 5. 打包发布（package.sh）

执行：

```bash
./package.sh
```

产物目录：`release/`

结构要点：
- `release/frontend/dist`：前端构建产物
- `release/frontend/nginx.conf`
- `release/frontend/Dockerfile`
- `release/docker-compose.yml`（release 专用，`./frontend` build context）
- `release/.env.example`
- `release/DEPLOY.md`

发布侧启动：

```bash
cd release
docker compose up -d --build
```

## 6. 常见排查

### 6.1 页面可打开但接口失败

检查：
- token 是否已输入（无 token 会被前端强拦截）
- `AGENT_API_TARGET`/`AGENT_API_UPSTREAM` 是否正确
- 后端是否可达

### 6.2 SSE 没有持续输出

检查：
- `/api/ap/query` 响应类型是否 `text/event-stream`
- Events/Logs 是否出现 `run.start`、`content.delta`、`run.complete`
- 是否被手动停止流式

### 6.3 Tools/Actions 无内容

检查：
- 当前 run 是否实际产生 `tool.*` 或 `action.*` 事件
- 是否切换到对应会话后重放了历史事件

## 7. 项目结构

```text
.
├── index.html
├── src
│   ├── main.js
│   ├── app
│   │   ├── bootstrap.js
│   │   ├── context
│   │   ├── actions
│   │   ├── handlers
│   │   └── runtime
│   ├── styles.css
│   └── lib
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── package.sh
└── vite.config.js
```
