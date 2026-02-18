# agw-springai-webclient

本项目是一个用于本地验证的 AGW 前端调试页面（Vanilla JS + Vite），用于直接对接 `agw-springai-agent` 的 `/api` 协议。

核心目标：
- 验证 `POST /api/query` 真流式 SSE
- 验证 `GET /api/chats`、`GET /api/chat` 历史回放
- 验证 `POST /api/submit` V2 前端工具提交（`runId + toolId + params`）
- 验证 `GET /api/viewport` 获取前端工具视图并覆盖输入区
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
  - pending frontend tool submit 面板（可直接编辑 `params`）
  - 原始事件 debug 日志
- 底部输入区
  - 默认显示普通输入框
  - 收到前端工具事件后切换为 iframe 覆盖面板，输入框隐藏并禁用
  - textarea 自动增高（1~6 行），超过后内部滚动
  - `Enter` 发送，`Shift+Enter` 换行

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

- 当收到 `tool.start/tool.snapshot` 且事件包含 `toolType + toolKey` 时：
  - 立即请求 `/api/viewport?viewportKey={toolKey}`
  - 用 iframe 覆盖输入区（用户无法直接输入消息）
  - 向 iframe 发送初始化消息：`{ type: 'agw_tool_init', data: {...} }`
- 前端工具初始化参数解析优先级：
  1. `event.toolParams`（对象）
  2. `event.function.arguments`（JSON 字符串或对象）
  3. `event.arguments`（JSON 字符串或对象）
  4. 失败回退 `{}`（并写入 debug）
- iframe 回传：`{ type: 'agw_frontend_submit', params: {...} }`
- host 调用 `/api/submit`，若 `accepted=true` 则恢复输入区，若 `accepted=false` 显示未命中状态并保持覆盖态
- 右侧 debug pending 面板可直接编辑 `params` 并手工提交
- 覆盖态只显示 iframe 本体，不展示 `runId/toolId/timeout` 和顶部提示文案
- 提交请求结构：

```json
{
  "runId": "...",
  "toolId": "...",
  "params": {}
}
```

- 提交响应关键字段：
  - `data.accepted=true|false`
  - `data.status=accepted|unmatched`
  - `data.detail`

### 4) Viewport HTML 渲染

- 从 assistant 文本里解析 ```viewport 块
- 仅处理 `type=html`
- 用 `key` 调用 `/api/viewport?viewportKey=...`
- 取返回 `data.html`，通过 `iframe.srcdoc` 渲染
- 渲染后向 iframe 发送 payload：`postMessage(payload, '*')`

前端工具覆盖输入框协议：

- host -> iframe：`{ type: 'agw_tool_init', data: { runId, toolId, toolKey, toolType, toolTimeout, params } }`
- iframe -> host：`{ type: 'agw_frontend_submit', params }`

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
   - 含 frontend tool 的场景：输入框被覆盖，提交后 `accepted=true` 主 SSE 继续；`accepted=false` 有明确提示

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
