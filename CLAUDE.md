# CLAUDE.md

本文件是 `agent-webclient` 的协作与实现基线，面向开发者/智能体。

核心目标：
- 架构边界清晰（UI、协议、运行时职责可分离）
- AGENT 协议消费行为可预测（历史回放与实时流一致）
- 改动后可验证（具备明确回归路径）

## 1. 项目定位

`agent-webclient` 是 AGENT 协议调试前端，不是生产业务前端。

本仓库用于联调与观察：
- `/api/ap/query` 的 SSE 事件流
- `/api/ap/chat` 的历史事件回放
- tool/action 生命周期在前端的呈现与执行
- viewport iframe 渲染与前端工具回传

## 2. 技术栈与运行参数

- 前端：Vanilla JS (ESM)
- 构建：Vite 5
- 测试：Vitest
- Node：18+
- 开发端口：`11948`（`PORT` 可覆盖）
- 预览端口：`4173`（`PREVIEW_PORT` 可覆盖）
- API 代理前缀：`/api/ap`
- 上游目标：`AGENT_API_TARGET`（默认值以 `vite.config.js` 为准）

## 3. 架构分层

### 3.1 入口与装配

- `src/main.js`
- `src/app/bootstrap.js`

职责：
- 组装 services/ui/actions/handlers
- 绑定 DOM 事件
- 初始化布局与面板
- 启动时执行 token 强约束检查

### 3.2 Context 层

- `src/app/context/state.js`：全局状态树
- `src/app/context/elements.js`：DOM 引用
- `src/app/context/constants.js`：常量

### 3.3 Actions 层

- `src/app/actions/chatActions.js`
- `src/app/actions/messageActions.js`

职责：
- 会话加载/切换/重置
- 消息发送与 SSE 消费
- 前端工具 submit 回传
- Access Token 应用/清空

### 3.4 Handlers 层

- `src/app/handlers/agentEventHandler.js`
- `src/app/handlers/domEvents.js`

职责：
- 消费 AGENT 事件并驱动状态与 UI
- 绑定页面交互（发送、抽屉、设置、debug tabs）

### 3.5 Runtime 层

- `statusDebugRuntime.js`：状态条与 debug 日志
- `timelineRuntime.js`：消息/推理/工具时间线渲染
- `frontendToolRuntime.js`：前端工具 iframe 与 Tools/Actions 面板
- `viewportRuntime.js`：内嵌 viewport 渲染
- `planRuntime.js`：计划面板运行态
- `uiRuntime.js`：通用 UI（events、chats、mention、token 弹窗）

### 3.6 协议访问与解析层（lib）

- `apiClient.js`：`/api/ap/*` 请求封装 + Bearer 注入 + ApiError
- `sseParser.js`：SSE 分帧与 JSON 消费
- `mentionParser.js`：`@agent` 解析
- `frontendToolParams.js`：tool 参数归一化
- `viewportParser.js` / `contentSegments.js`：viewport 块解析
- `actionRuntime.js`：浏览器侧 action 执行

## 4. 状态模型（重点）

关键状态：
- 会话态：`chatId`、`runId`、`streaming`、`abortController`
- 数据态：`agents`、`chats`、`events`
- 工具态：`toolStates`、`pendingTools`、`activeFrontendTool`
- 动作态：`actionStates`、`executedActionIds`
- 渲染态：`timelineNodes`、`timelineOrder`、`renderQueue`
- UI 态：`settingsOpen`、`activeDebugTab`、`accessToken`

重置策略：
- `resetConversationState()`：切会话/新会话时清空完整上下文
- `resetRunTransientState()`：发送前清空 run 级瞬态（tool/reasoning/pending）

## 5. 事件驱动实现

入口：`handleAgentEvent(event, source)`，`source` 为 `live|history`。

### 5.1 已消费事件

- 运行：`request.query`、`run.start`、`run.complete`、`run.error`、`run.cancel`
- 计划：`plan.update`、`task.start`、`task.complete`、`task.cancel`、`task.fail`
- 推理：`reasoning.start|delta|snapshot|end`
- 内容：`content.start|delta|snapshot|end`
- 工具：`tool.start|args|snapshot|result|end`
- 动作：`action.start|args|snapshot|end`

### 5.2 关键行为

- `run.complete/error/cancel` 结束 streaming，并清理前端工具覆盖层。
- `tool.*`、`action.*` 会同步进入 Debug 的 `Tools/Actions` 只读面板。
- `action.*` 在参数齐备后调用 `actionRuntime.execute()`，同一 `actionId` 幂等执行一次。
- `Events` 面板每行点击可弹出单例小浮窗，显示当前 event 完整 JSON。

## 6. API 消费契约

成功响应统一包络：

```json
{
  "code": 0,
  "msg": "success",
  "data": {}
}
```

失败场景（HTTP 非 2xx / JSON 非法 / `code != 0`）统一抛 `ApiError`。

### 6.1 `GET /api/ap/agents`

前端依赖：`key`、`name`。

### 6.2 `GET /api/ap/chats`

前端依赖：`chatId`、`chatName`、`firstAgentName`、`firstAgentKey`、`updatedAt`。

### 6.3 `GET /api/ap/chat?chatId=...&includeRawMessages=true?`

前端依赖：`events`；调试可选 `rawMessages/messages`。

### 6.4 `POST /api/ap/query`

当前发送路径必需字段：
- `message`

可选字段：
- `agentKey`（`@mention` 或 chat 记忆）
- `chatId`

响应必须是 `text/event-stream`。

### 6.5 `GET /api/ap/viewport?viewportKey=...`

前端依赖：`data.html`。

### 6.6 `POST /api/ap/submit`

请求体：`runId`、`toolId`、`params`。

## 7. Token 策略（强约束）

- Token 仅保存在页面内存，不使用本地持久化。
- 首次进入若 token 为空：
  - 自动弹出 Settings
  - 输入框红色高亮
  - 状态栏报错
- 发送消息前若 token 为空：
  - 阻断发送
  - 再次弹窗并红色高亮

## 8. Debug 面板规则

- `Events`：最近事件列表（点击行打开单例小浮窗看完整 JSON）
- `Logs`：原始 debug 行
- `Tools/Actions`：只读展示 `tool.*` 与 `action.*` 全量事件（无编辑/无提交按钮）

## 9. 部署与打包规则

- 根目录 `docker-compose.yml`：可直接 `docker compose up -d --build`
- `nginx.conf`：代理 `/api/ap/`，并启用 SSE 关键配置（如 `proxy_buffering off`）
- `package.sh`：构建 `dist` 后生成 `release/`，并写入 release 专用 compose（`./frontend` context）

## 10. 特别关注（改动红线）

1. 不改后端协议语义；本仓库是消费方。
2. 新增事件处理必须保持 live/history 一致行为。
3. 解析失败必须进 debug，不可静默吞掉。
4. 涉及 tool/action 消息结构变更时，必须同步文档与测试。
5. Debug 展示与状态上限保持受控：`events` 由 `MAX_EVENTS` 限制。

## 11. 建议回归

```bash
npm test
npm run build
```
