# chat-debug-console

## 页面目标
提供消息发送、历史回放、流式消费与调试观察的一体化控制台。

## 核心字段与校验
| 字段 | 组件 | 前端校验 |
|---|---|---|
| `message` | composer input | 非空；`Enter` 发送，`Shift+Enter` 换行 |
| `@agentKey` | mention parser | 可选；解析失败时按普通文本 |
| `chatId` | chat list | 切换时触发会话重载 |

## 交互流程
1. 用户输入并触发发送。
2. 前置校验：token 必填、streaming 状态、pending tool 状态。
3. 调用 `POST /api/ap/query`，消费 SSE。
4. 事件驱动渲染 timeline/debug。
5. run 终止事件到达后恢复可发送状态。

## 失败提示与重试
- token 缺失：弹 Settings + 红色高亮。
- API/SSE 异常：状态栏与 debug 显示错误。
- 可在修复条件后重新发送。
