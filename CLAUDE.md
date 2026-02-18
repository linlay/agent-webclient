# CLAUDE.md

本文件用于指导后续在本仓库协作开发的 AI/工程师，重点保证：协议对齐、调试效率、改动可验证。

## Project Context

- 项目名：`agw-springai-webclient`
- 目标：本地调试 `agw-springai-agent` `/api` 协议
- 技术：Vanilla JS + Vite + Vitest
- 后端默认地址：`http://localhost:8080`（通过 Vite proxy 转发 `/api`）

## Start Commands

```bash
npm install
npm run dev
npm test
npm run build
```

可选：

```bash
AGW_API_TARGET=http://127.0.0.1:8080 PORT=5174 npm run dev
```

## Implementation Contracts

### 1. API / Streaming Contract

- `/api/query` 必须使用 `fetch + ReadableStream` 实现，禁止改成 EventSource（EventSource 不支持 POST body）
- SSE 解析逻辑在 `src/lib/sseParser.js`：
  - 支持分片
  - 支持多行 `data:`
  - 支持注释心跳
- 每个 `data` JSON 事件统一走 `handleAgwEvent`（`src/main.js`）

### 2. Chat / History Contract

- `/api/chat` 回放事件必须复用同一套事件处理逻辑
- `rawMessages` 为主字段，`messages` 为兼容兜底
- `plan.update` 事件需容忍 `seq` 缺失（query 流中被 normalize 的情况）

### 3. Frontend Tool Submit Contract

- 仅当工具事件携带 `toolType + toolKey` 时创建 pending submit 条目并覆盖输入框
- 工具参数解析顺序固定：
  1. `event.toolParams`
  2. `event.function.arguments`
  3. `event.arguments`
  4. 解析失败回退 `{}`，并保留 debug
- 提交结构：
  - `runId/toolId/params`
- 提交响应：
  - `accepted=true|false`
  - `status=accepted|unmatched`
- 覆盖输入框时的 iframe 协议：
  - host -> iframe：`agw_tool_init`
  - iframe -> host：`agw_frontend_submit`
- 覆盖态 UI 只保留 iframe，不显示 run/tool 元信息和提示文案
- 相关代码：`submitPendingTool` in `src/main.js`

### 4. Action Contract

- action 由 `src/lib/actionRuntime.js` 执行
- 已支持：
  - `switch_theme`
  - `launch_fireworks`
  - `show_modal`
- 防重复：`state.executedActionIds`
- 参数来源：
  - 流式：`action.start + action.args + action.end`
  - 历史：`action.snapshot.arguments`

### 5. Viewport Contract

- 只处理 ```viewport 的 `type=html`
- 通过 `/api/viewport` 获取 `data.html`
- 用 `iframe.srcdoc` 渲染并注入 payload（`postMessage`）
- 接收 iframe 回传：`{ type: 'agw_chat_message', message }` 并自动触发下一轮 query

## File Ownership / Responsibility

- `src/main.js`
  - 状态管理
  - UI 渲染
  - 事件分发
  - query/chat/submit 主流程
- `src/lib/apiClient.js`
  - `/api/*` 请求封装
  - ApiResponse 校验与错误封装
- `src/lib/sseParser.js`
  - 原始 SSE 解析
- `src/lib/viewportParser.js`
  - viewport 块解析
- `src/lib/actionRuntime.js`
  - 前端 action 执行器

## Testing Guidance

优先保证以下测试通过：

- `src/lib/sseParser.test.js`
- `src/lib/viewportParser.test.js`
- `src/lib/actionRuntime.test.js`

提交前建议至少执行：

```bash
npm test
npm run build
```

## Change Rules

- 不要改动后端协议定义（本仓库是消费方）
- 新增 UI 功能时，优先保持协议调试可视化能力
- 出错时要保留 debug 信息，不要吞异常
- 保持无框架依赖（除非明确升级为 React/Vue）
- composer 输入框保持自动增高（1~6 行），`Enter` 发送、`Shift+Enter` 换行

## Known Scope Boundaries

- 这是调试客户端，不追求完整产品化体验
- 当前 viewport 仅支持 html 渲染
- 没有做认证、权限、生产安全策略
