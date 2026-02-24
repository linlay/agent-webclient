# AGENT SpringAI Webclient

AGENT 协议调试前端（Vanilla JS + Vite）。

本项目用于本地联调 AGENT Agent 网关，重点验证：
- `/api/ap/query` 的 SSE 流式事件
- `/api/ap/chats`、`/api/ap/chat` 的会话与历史回放
- `/api/ap/submit` 的前端工具回传
- `/api/ap/viewport` 的可视化视图渲染

## 1. 环境要求

- Node.js 18+
- 可访问 AGENT 后端 API（默认代理目标：`http://localhost:11946`）

## 2. 安装与启动

安装依赖：

```bash
npm install
```

开发模式：

```bash
npm run dev
```

默认地址：`http://localhost:11948`

生产构建：

```bash
npm run build
```

本地预览：

```bash
npm run preview
```

默认预览地址：`http://localhost:4173`

运行测试：

```bash
npm test
```

## 3. 环境变量

本项目通过 Vite 代理 `/api/ap`。

- `AGENT_API_TARGET`：后端地址，默认 `http://localhost:11946`
- `PORT`：开发端口，默认 `11948`
- `PREVIEW_PORT`：预览端口，默认 `4173`

示例：

```bash
AGENT_API_TARGET=http://127.0.0.1:8080 PORT=5173 npm run dev
```

## 4. 操作手册

### 4.1 首次进入

1. 打开页面后会自动请求 Agents 和 Chats。
2. 右上角状态栏显示当前状态（`ready` 表示可用）。

### 4.2 配置 Access Token（可选）

1. 点击 `设置`。
2. 在 `Access Token` 输入框填入原始 token（不要带 `Bearer ` 前缀）。
3. 点击 `应用 Token`。

行为说明：
- Token 仅存在页面内存，刷新后失效。
- 所有 `/api/ap/*` 请求会自动附加 `Authorization: Bearer <token>`。

### 4.3 发起会话

1. 可在设置里选择默认 Agent（锁定）。
2. 在输入框直接发送，或用 `@agentKey` 前缀临时指定 Agent。
3. `Enter` 发送，`Shift+Enter` 换行。

规则：
- `@mention` 优先级高于“锁定 Agent”。
- 流式进行中不能再次发送（需先“停止流式”）。

### 4.4 会话管理

- 左侧 `新会话`：清空当前上下文，准备新 chat。
- 左侧列表点击某条会话：加载历史事件并回放。
- `Load Raw Chat`：用 `includeRawMessages=true` 重新加载当前 chat。

### 4.5 调试区使用

右侧 `Debug` 有 3 个标签页：
- `Events`：事件时间线（最近 300 条）
- `Logs`：原始 debug 日志（最近 220 行）
- `Tools`：待提交工具参数面板

### 4.6 前端工具提交流程

当收到前端工具事件（`toolType` 为 `html/qlc` 且有 `toolKey`）时：

1. 输入区切换为 iframe 工具面板。
2. 页面自动请求 `/api/ap/viewport?viewportKey=...` 并渲染。
3. 可通过两种方式提交：
- iframe 发 `frontend_submit`
- 右侧 `Tools` 面板手动编辑参数并提交

提交成功（`accepted=true`）后恢复普通输入区。

### 4.7 Viewport 内容渲染

assistant 文本中的 ` ```viewport ... ``` ` 代码块会被解析：
- 仅 `type=html` 会在消息区内嵌渲染
- 同时在右侧 Viewport 调试区单独渲染一份
- 渲染完成后，会把 payload 通过 `postMessage` 发给 iframe

### 4.8 Markdown 正文渲染

`content.delta` / `content.snapshot` 的正文支持常用 Markdown（段落、列表、代码、链接、图片）。

图片 URL 规则：
- `http://`、`https://`：保持原样
- 其余路径（包括 `/data/...`、`./...`、`../...`、裸文件名）：重写为
  `/api/ap/data?file=<url-encoded-path>`

示例：
- `![示例](/data/sample_photo.jpg)`
- 会渲染为 `<img src="/api/ap/data?file=%2Fdata%2Fsample_photo.jpg" ...>`

## 5. 常见排查

### 5.1 页面启动但接口报错

检查：
- 后端是否可达（`AGENT_API_TARGET`）
- 开发端口是否冲突（`PORT`）
- Token 是否填写了 `Bearer ` 前缀（不允许）

### 5.2 SSE 没有持续输出

检查：
- 后端 `/api/ap/query` 是否返回 `text/event-stream`
- Events/Logs 面板是否有 `run.start`、`content.delta`、`run.complete`
- 是否被手动“停止流式”中断

### 5.3 submit 未命中

`/api/ap/submit` 响应 `accepted=false` 时，右侧会显示 `status/detail`。
优先核对：`runId`、`toolId`、`params` 是否匹配当前等待中的工具。

## 6. 项目结构

```text
.
├── index.html
├── src
│   ├── main.js
│   ├── app
│   │   ├── bootstrap.js
│   │   ├── context
│   │   │   ├── constants.js
│   │   │   ├── createAppContext.js
│   │   │   ├── elements.js
│   │   │   └── state.js
│   │   ├── actions
│   │   │   ├── chatActions.js
│   │   │   └── messageActions.js
│   │   ├── handlers
│   │   │   ├── agentEventHandler.js
│   │   │   └── domEvents.js
│   │   └── runtime
│   │       ├── frontendToolRuntime.js
│   │       ├── planRuntime.js
│   │       ├── statusDebugRuntime.js
│   │       ├── timelineRuntime.js
│   │       ├── uiRuntime.js
│   │       └── viewportRuntime.js
│   ├── styles.css
│   └── lib
│       ├── apiClient.js
│       ├── contentSegments.js
│       ├── markdownRenderer.js
│       ├── sseParser.js
│       ├── viewportParser.js
│       ├── mentionParser.js
│       ├── frontendToolParams.js
│       ├── actionRuntime.js
│       └── *.test.js
├── package.json
└── vite.config.js
```

## 7. 脚本列表

- `npm run dev`：启动开发服务
- `npm run build`：构建产物到 `dist/`
- `npm run preview`：本地预览构建产物
- `npm test`：运行 Vitest
# agent-webclient
# agent-webclient
