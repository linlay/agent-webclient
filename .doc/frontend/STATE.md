# 状态管理设计

## 1. 状态管理工具
- 原生对象状态（context + runtime），无外部状态库。

## 2. 全局状态切分
| State 名 | 职责 | 持久化 | 关键字段 |
|---|---|---|---|
| 会话态 | 当前会话和 run 生命周期 | 否 | `chatId`, `runId`, `streaming`, `abortController` |
| 数据态 | agents/chats/events 数据缓存 | 否 | `agents`, `chats`, `events` |
| 工具态 | frontend tool 生命周期 | 否 | `toolStates`, `pendingTools`, `activeFrontendTool` |
| 动作态 | 浏览器 action 生命周期 | 否 | `actionStates`, `executedActionIds` |
| 渲染态 | timeline 增量渲染队列 | 否 | `timelineNodes`, `timelineOrder`, `renderQueue` |
| UI 态 | 设置面板与 token 等 | 否 | `settingsOpen`, `activeDebugTab`, `accessToken` |

## 3. 状态读写规则
1. token 仅内存态保存，不做本地持久化。
2. `resetConversationState()`：切会话/新会话清空完整上下文。
3. `resetRunTransientState()`：发送前清 run 级瞬态。
4. `actionId` 使用集合幂等去重，避免重复执行。

## 4. API 调用归属
- 调用封装在 `lib/apiClient.js`。
- 行为编排由 `app/actions/*` 负责。
- 事件分发由 `app/handlers/agentEventHandler.js` 负责。
