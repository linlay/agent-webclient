# agw-springai-webclient

本项目是一个用于本地验证的 AGW 前端调试页面（Vanilla JS + Vite），用于直接对接 `agw-springai-agent` 的 `/api` 协议。

核心目标：
- 验证 `POST /api/query` 真流式 SSE
- 验证 `GET /api/chats`、`GET /api/chat` 历史回放
- 验证 `POST /api/submit` 前端工具提交
- 验证 `GET /api/viewport` + ```viewport(type=html) 渲染
- 验证 action：`switch_theme`、`launch_fireworks`、`show_modal`

## 技术栈

- Vanilla JavaScript (ESM)
- Vite 5
- Vitest（单测）

## 快速开始

### 1. 前置条件

- Node.js 18+
- `agw-springai-agent` 已在本地启动（默认 `http://localhost:8080`）

### 2. 安装依赖

```bash
npm install
```

### 3. 本地启动

```bash
npm run dev
```

默认打开：`http://localhost:5173`

### 4. 构建与预览

```bash
npm run build
npm run preview
```

### 5. 运行测试

```bash
npm test
```

## 环境变量

本项目通过 Vite 代理 `/api`，默认代理到 `http://localhost:8080`。

可选环境变量：

- `AGW_API_TARGET`：后端目标地址（默认 `http://localhost:8080`）
- `PORT`：开发端口（默认 `5173`）
- `PREVIEW_PORT`：`vite preview` 端口（默认 `4173`）

示例：

```bash
AGW_API_TARGET=http://127.0.0.1:8080 PORT=5174 npm run dev
```

## 页面功能说明

页面为三栏布局：

- 左侧（控制区）
  - Agent 选择
  - 会话列表刷新与切换
  - 当前 chatId 与 API 状态
- 中间（对话与事件）
  - 消息流（user / assistant / system）
  - 事件时间线（SSE 事件可视化）
  - plan.update 面板
- 右侧（调试区）
  - viewport HTML 渲染
  - pending frontend tool submit 面板
  - 原始事件 debug 日志

## 协议对接细节

### 1) Query 流式 (`POST /api/query`)

- 使用 `fetch + ReadableStream` 手动解析 SSE（不是 EventSource）
- 仅消费 `data:` 帧
- 心跳注释帧（如 `:heartbeat`）会被忽略
- 每个 JSON 事件交给统一分发器处理

当前支持的事件类型包含：

- 输入/运行：`request.query`、`chat.start`、`run.start`、`run.complete`、`run.error`、`run.cancel`
- 计划：`plan.update`
- 推理与内容：`reasoning.*`、`content.*`
- 工具与动作：`tool.*`、`action.*`
- 来源：`source.snapshot`

### 2) 历史回放 (`GET /api/chat`)

- 默认请求：`/api/chat?chatId=...`
- 可选：`includeRawMessages=true`
- 历史事件（如 `*.snapshot`）和流式事件走同一个前端事件处理链
- 兼容读取 `rawMessages`（并兜底 `messages`）

### 3) 前端工具提交 (`POST /api/submit`)

- 当收到 `tool.start` 且 `toolType === 'frontend'` 时，进入 pending 列表
- UI 中可编辑 payload（JSON）并提交
- 提交请求结构：

```json
{
  "requestId": "req_submit_xxx",
  "chatId": "...",
  "runId": "...",
  "toolId": "...",
  "viewId": "...",
  "payload": {
    "params": {}
  }
}
```

### 4) Viewport HTML 渲染

- 从 assistant 文本里解析 ```viewport 块
- 仅处理 `type=html`
- 用 `key` 调用 `/api/viewport?viewportKey=...`
- 取返回 `data.html`，通过 `iframe.srcdoc` 渲染
- 渲染后向 iframe 发送 payload：`postMessage(payload, '*')`

同时支持 viewport 页面反向发消息：

```js
window.parent.postMessage({ type: 'agw_chat_message', message: '...' }, '*')
```

宿主收到后会自动触发下一轮 query。

### 5) Action 运行时

- `switch_theme(theme)`：切换 `html[data-theme]`
- `launch_fireworks(durationMs?)`：全屏 canvas 粒子动画（1000~30000ms）
- `show_modal(title, content, closeText?)`：弹窗展示

防重复策略：同一个 `actionId` 只执行一次。

## 常用本地验证流程

1. 启动 `agw-springai-agent`（`localhost:8080`）
2. 启动本项目：`npm run dev`
3. 在页面里选择 agent 并发送消息
4. 验证：
   - `demoAction`：主题切换、烟花、弹窗
   - `demoViewport`：viewport block 被解析并渲染
   - 含 frontend tool 的场景：pending submit 可提交并得到 accepted

## 项目结构

```text
.
├── index.html
├── package.json
├── vite.config.js
├── src
│   ├── main.js
│   ├── styles.css
│   └── lib
│       ├── apiClient.js
│       ├── actionRuntime.js
│       ├── sseParser.js
│       ├── viewportParser.js
│       ├── *.test.js
└── dist
```

## 注意事项

- 当前 viewport 只渲染 `type=html`；其它类型不会渲染组件。
- 本项目用于本地协议验证，不是生产 UI。
- 若后端地址不是 `localhost:8080`，请设置 `AGW_API_TARGET`。
