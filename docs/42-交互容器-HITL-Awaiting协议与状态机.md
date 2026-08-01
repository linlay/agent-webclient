# HITL-Awaiting协议与状态机

## 当前状态

HITL 由 awaiting ask/answer 事件驱动，前端支持 question、approval、form、plan 四种 mode。活动态保存在 `state.activeAwaiting`，归一化逻辑集中在 `awaitingRuntime.ts`，提交去重和终态处理由专门工具维护。实时流中的 `awaiting.ask` 可以立即激活交互；历史回放完成后则必须再由 `/api/chat.awaiting` 校准，历史 ask 本身不是可提交凭据。

## 核心职责

- 解析 awaiting ask 事件并创建对应 ActiveAwaiting。
- 处理 awaiting answer、超时、远端回答和本地提交完成。
- 以 `/api/chat.awaiting` 为 replay 后唯一活动态，清除孤立或不匹配的历史 awaiting。
- 记录 question/approval/form 元数据，用于 timeline answer 回显脱敏。
- 为 Composer awaiting shell 和内置对话框提供统一状态。

## 核心流程

运行事件到达后，action runtime 调用 `reduceActiveAwaiting` 更新 active awaiting。UI 根据 mode 渲染 question、approval、form 或 plan。用户提交后生成 awaiting submit payload，提交成功或收到匹配 answer 后清理 active awaiting。

加载历史 chat 时先完整 replay events，再执行权威校准：

- 顶层 `awaiting` 缺失或为 null：清空 replay 产生的 `activeAwaiting` 与 `pendingAwaitings`，但不删除 events、debug timeline 或历史交互展示。
- 顶层 `awaiting.status == "awaiting"`：将 wire `mode:"planning"` 映射为前端 `mode:"plan"`，再按 `runId + awaitingId + mode` 与 replay ask 精确匹配，只保留该项。
- 顶层存在但缺字段、状态不对或找不到完整 ask：不生成空卡片，Composer 保持可输入，并写入 `[awaiting_contract_violation]` debug 诊断。

Submit 收到 HTTP 409 `awaiting_expired`、`awaiting_interrupted`、`already_resolved`，或旧 Platform 的 `unknown awaitingId` 文案后，会清理 submit tracker 和本地 awaiting、停止伪 streaming、清空 abort controller，并重新触发 `agent:load-chat`。提示分别为“已超时/失效”“服务已重启，请重新发起”“已处理”；结构化错误码优先于文案 fallback。

## 边界与非目标

- HITL 是前端交互协议消费，不定义后端审批规则。
- 四种 awaiting mode 分别有独立 UI 和提交参数，不应混在一个组件里扩展。
- answer 回显需要脱敏，不直接暴露用户输入中的敏感字段。
- 前端不按本机时钟判断跨重启等待项是否超时；Platform 顶层 awaiting 是唯一事实源。

## 相关文件

- `../src/features/tools/lib/awaitingRuntime.ts`
- `../src/features/tools/lib/awaitingSubmitTracker.ts`
- `../src/features/tools/lib/awaitingQuestionMeta.ts`
- `../src/features/tools/lib/awaitingAnswerError.ts`
- `../src/features/events/lib/processors/eventProcessorAwaiting.ts`
- `../src/features/composer/hooks/useComposerAwaiting.ts`
- `../src/features/conversation/lib/conversationReplay.ts`
