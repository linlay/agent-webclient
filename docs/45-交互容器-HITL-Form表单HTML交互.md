# HITL-Form表单HTML交互

## 当前状态
Form awaiting 使用后端 viewport HTML 渲染交互表单。前端要求 `viewportType` 为 HTML，并通过 `viewportKey` 拉取 HTML，iframe 内部通过 postMessage 与宿主通信，提交 form payload。

## 核心职责
- 归一化 forms，维护当前 form index 和 form meta。
- 加载 `/api/viewport` HTML 并注入 iframe。
- 向 iframe 发送 init/update/collect 消息。
- 接收 iframe close、submit、collect result，并构造 awaiting submit payload。

## 核心流程
`reduceActiveAwaiting` 进入 form 模式后保存 viewportKey、forms 和 runtime state。`AwaitingHtmlContainer` 拉取 HTML，iframe load 后发送初始化消息。用户提交时，宿主请求 iframe collect 数据，校验 payload 后调用 awaiting submit。

## 边界与非目标
- Form 依赖 viewport HTML，不负责内置 React 表单渲染。
- iframe 内容必须 sandbox；跨 frame 消息只接受当前 iframe source。
- HTML 表单具体字段和验证规则由 viewport 内容与后端协议决定。

## 相关文件
- `../src/features/tools/components/AwaitingHtmlContainer.tsx`
- `../src/features/tools/lib/awaitingRuntime.ts`
- `../src/features/tools/lib/viewportParser.ts`
- `../src/features/tools/components/protocol.ts`
- `../src/shared/data/routedClient.ts`
- `../src/app/state/toolTypes.ts`

