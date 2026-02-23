# CLAUDE.md

本文件是本仓库协作规范，面向开发者/智能体。重点是：
- 架构边界清晰
- 协议消费行为可预测
- 改动后可验证

## 1. 项目定位

`agw-springai-webclient` 是 AGW 协议调试前端，不是生产业务前端。

目标：
- 复现和观察 AGW 流式事件（SSE）
- 回放 chat 历史事件
- 验证工具调用、前端工具提交与 viewport 渲染
- 验证 action 事件在浏览器侧的执行效果

## 2. 技术与运行参数

- 技术栈：Vanilla JS（ESM）+ Vite 5 + Vitest
- Node：18+
- 开发端口：`11945`（`PORT` 可覆盖）
- API 代理：`/api -> http://localhost:11946`（`AGW_API_TARGET` 可覆盖）
- 预览端口：`4173`（`PREVIEW_PORT` 可覆盖）

## 3. 模块分层

### 3.1 入口层

- `src/main.js`

职责：
- DOM 事件绑定
- 全局状态管理
- AGW 事件分发（`handleAgwEvent`）
- Timeline / Plan / Debug 渲染
- 前端工具 iframe 生命周期

### 3.2 协议访问层

- `src/lib/apiClient.js`

职责：
- 封装 `/api/*` 请求
- 统一 Bearer Token 注入
- 校验 ApiResponse 包络
- 统一抛出 `ApiError`

### 3.3 协议解析层

- `src/lib/sseParser.js`：SSE 帧切分与 JSON 事件消费
- `src/lib/viewportParser.js`：` ```viewport` 块解析
- `src/lib/mentionParser.js`：输入框前缀 `@agent` 解析
- `src/lib/frontendToolParams.js`：工具参数多来源归一化

### 3.4 前端动作层

- `src/lib/actionRuntime.js`

职责：
- `switch_theme`
- `launch_fireworks`
- `show_modal`

并提供参数标准化与兜底。

## 4. 状态模型（`src/main.js`）

关键状态分组：
- 会话态：`chatId`、`runId`、`streaming`、`abortController`
- 数据态：`agents`、`chats`、`events`
- 计划态：`plan`、`planRuntimeByTaskId`、`planCurrentRunningTaskId`
- 工具态：`toolStates`、`pendingTools`、`activeFrontendTool`
- 推理态：`reasoningNodeById`、`activeReasoningKey`
- 渲染态：`timelineNodes`、`timelineOrder`、`renderQueue`

重置策略：
- `resetConversationState()`：切会话/新会话时清空完整上下文
- `resetRunTransientState()`：发新消息前清空 run 级瞬态（工具/推理/pending）

## 5. 事件驱动实现方案

SSE JSON 事件全部进入 `handleAgwEvent(event, source)`，`source` 为：
- `live`：实时流
- `history`：`/api/chat` 历史回放

### 5.1 已消费事件类型

- 运行：`request.query`、`run.start`、`run.complete`、`run.error`、`run.cancel`
- 计划：`plan.update`、`task.start`、`task.complete`、`task.cancel`、`task.fail`
- 推理：`reasoning.start`、`reasoning.delta`、`reasoning.snapshot`、`reasoning.end`
- 内容：`content.start`、`content.delta`、`content.snapshot`、`content.end`
- 工具：`tool.start`、`tool.args`、`tool.snapshot`、`tool.result`、`tool.end`
- Action：`action.start`、`action.args`、`action.snapshot`、`action.end`

### 5.2 行为要点

- `run.complete/run.error/run.cancel` 会结束 streaming 状态并清理前端工具覆盖层。
- `plan.update` 触发 Plan 面板更新，任务状态由 plan + task lifecycle 合并。
- `reasoning.*` 在 timeline 中以可折叠节点呈现，并带自动收起定时器。
- `content.*` 会触发 viewport 代码块解析与加载。
- `tool.*` 会维护工具参数、结果和 pending submit 状态。
- `action.*` 会在参数齐备后调用 `actionRuntime.execute()`，同一 `actionId` 仅执行一次。

## 6. API 定义（消费侧）

所有成功响应必须满足包络：

```json
{
  "code": 0,
  "msg": "success",
  "data": {}
}
```

若 HTTP 非 2xx、JSON 非法、或 `code != 0`，`apiClient` 会抛 `ApiError`。

### 6.1 `GET /api/agents`

用途：拉取 Agent 列表。

前端依赖字段：
- `key`（必需，@mention 和锁定选择使用）
- `name`（展示）

### 6.2 `GET /api/chats`

用途：拉取会话列表。

前端依赖字段：
- `chatId`
- `chatName`
- `firstAgentKey`
- `updatedAt`

### 6.3 `GET /api/chat?chatId=...&includeRawMessages=true?`

用途：加载会话历史并回放事件。

前端依赖字段：
- `events`：事件数组（核心）
- `rawMessages` 或 `messages`：仅在调试时记录计数

### 6.4 `POST /api/query`

请求体（`createQueryStream` 支持字段）：

```json
{
  "message": "...",
  "agentKey": "optional",
  "chatId": "optional",
  "role": "optional",
  "references": [],
  "params": {},
  "scene": "optional",
  "stream": true
}
```

当前发送路径 `sendMessage()` 实际使用：
- `message`（必填）
- `agentKey`（来自 `@mention` 或锁定 Agent，可选）
- `chatId`（已有会话时可选）

响应：`text/event-stream`，每个 `data:` 行是 JSON 事件。

### 6.5 `GET /api/viewport?viewportKey=...`

用途：
- 前端工具覆盖区 iframe 加载
- assistant 内容中的 viewport 内嵌渲染

前端依赖字段：
- `data.html`（字符串）

### 6.6 `POST /api/submit`

请求体：

```json
{
  "runId": "...",
  "toolId": "...",
  "params": {}
}
```

前端依赖响应字段：
- `data.accepted`（布尔）
- `data.status`（例如 `accepted` / `unmatched`）
- `data.detail`（文本说明）

## 7. 前端工具与 iframe 协议

### 7.1 工具识别规则

判定为“前端工具事件”的条件：
- `toolType` in `{ html, qlc }`
- `toolKey` 非空

### 7.2 参数解析优先级

`parseFrontendToolParams(event)` 顺序固定：
1. `event.toolParams`（对象）
2. `event.function.arguments`（对象或 JSON 字符串）
3. `event.arguments`（对象或 JSON 字符串）
4. 未命中则 `found=false`

解析失败会返回 `error`，主流程写入 debug，但不阻断。

### 7.3 消息协议

Host -> iframe（初始化）：

```json
{
  "type": "tool_init",
  "data": {
    "runId": "...",
    "toolId": "...",
    "toolKey": "...",
    "toolType": "html|qlc",
    "toolTimeout": 120000,
    "params": {}
  }
}
```

iframe -> Host（提交）：

```json
{
  "type": "frontend_submit",
  "params": {}
}
```

iframe -> Host（代发聊天消息）：

```json
{
  "type": "chat_message",
  "message": "..."
}
```

## 8. Viewport 解析与渲染方案

### 8.1 文本协议

支持在 assistant 文本中内嵌：

~~~text
```viewport
type=html, key=some_key
{"a":1}
```
~~~

说明：
- 仅 `type=html` 会进入内容区内嵌渲染。
- Header 至少要有 `type` 和 `key`。
- payload JSON 解析失败时，保留 `payloadRaw` 并用 `{}` 兜底。

### 8.2 双渲染通道

同一 viewport 会走两条通道：
- 消息内容区内嵌 iframe（与内容节点绑定）
- 右侧 Viewport 调试区（用于观察）

两处都会在 iframe `load` 后投递 payload。

## 9. UI 与交互约束

- 输入框自动高度 1~6 行。
- `Enter` 发送，`Shift+Enter` 换行。
- streaming 中禁止再次发送。
- 存在 `activeFrontendTool` 时禁止普通发送。
- Access Token 不落盘，仅内存。
- 布局模式：
  - `desktop-fixed`（>=1280）左右栏固定
  - `tablet-mixed`（>=768）左栏固定右栏抽屉
  - `mobile-drawer`（<768）双抽屉

## 10. 测试与回归要求

现有单元测试覆盖：
- `apiClient`：Bearer 头注入
- `sseParser`：分片/多行 data/注释帧
- `frontendToolParams`：参数来源优先级与错误兜底
- `mentionParser`：`@mention` 解析
- `viewportParser`：viewport block 解析
- `actionRuntime`：参数归一化

建议回归命令：

```bash
npm test
npm run build
```

## 11. 改动红线

- 不要改动后端协议语义（本仓库是消费方）。
- 新增事件处理必须保证历史回放与实时流路径一致。
- 对解析失败/协议异常必须保留 debug，不可静默吞掉。
- 若修改 `tool_init`/`frontend_submit` 消息结构，必须同步更新文档与测试。
