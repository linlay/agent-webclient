# FrontendTool容器协议

## 当前状态
Frontend Tool 是运行中工具事件触发的前端 iframe 工具容器。前端从工具事件中解析 viewportKey、toolId、toolType、toolTimeout、params 等信息，加载 viewport HTML 后与 iframe 通信，并通过 `/api/submit` 提交工具结果。

## 核心职责
- 从 tool event 和 args 中解析 frontend tool params。
- 维护 `state.activeFrontendTool`。
- 加载工具 viewport HTML 并发送 `tool_init`。
- 接收 iframe `frontend_submit`、`close`、`done` 消息并提交或关闭容器。

## 核心流程
tool processor 将工具事件中的 viewportKey 和 params 写入 tool state。运行时识别 active frontend tool 后，`FrontendToolContainer` 调用 `getViewport`，iframe load 后 postMessage 初始化数据。iframe 提交时前端调用 `submitTool({ runId, agentKey, toolId, params })`。

## 边界与非目标
- Frontend Tool 容器不同于 HITL awaiting；它基于 toolId 提交。
- 工具 HTML 的业务逻辑不在本仓库维护。
- 前端只处理 iframe 消息和提交，不执行后端工具。

## 相关文件
- `../src/features/tools/components/FrontendToolContainer.tsx`
- `../src/features/tools/lib/frontendToolParams.ts`
- `../src/features/timeline/lib/eventProcessorTool.ts`
- `../src/features/timeline/lib/toolEvent.ts`
- `../src/app/state/toolTypes.ts`
- `../src/shared/data/routedClient.ts`

