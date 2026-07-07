# HITL-Awaiting协议与状态机

## 当前状态
HITL 由 awaiting ask/answer 事件驱动，前端支持 question、approval、form、plan 四种 mode。活动态保存在 `state.activeAwaiting`，归一化逻辑集中在 `awaitingRuntime.ts`，提交去重和超时处理由专门工具维护。

## 核心职责
- 解析 awaiting ask 事件并创建对应 ActiveAwaiting。
- 处理 awaiting answer、超时、远端回答和本地提交完成。
- 记录 question/approval/form 元数据，用于 timeline answer 回显脱敏。
- 为 Composer awaiting shell 和内置对话框提供统一状态。

## 核心流程
运行事件到达后，action runtime 调用 `reduceActiveAwaiting` 更新 active awaiting。UI 根据 mode 渲染 question、approval、form 或 plan。用户提交后生成 awaiting submit payload，提交成功或收到匹配 answer 后清理 active awaiting。

## 边界与非目标
- HITL 是前端交互协议消费，不定义后端审批规则。
- 四种 awaiting mode 分别有独立 UI 和提交参数，不应混在一个组件里扩展。
- answer 回显需要脱敏，不直接暴露用户输入中的敏感字段。

## 相关文件
- `../src/features/tools/lib/awaitingRuntime.ts`
- `../src/features/tools/lib/awaitingSubmitTracker.ts`
- `../src/features/tools/lib/awaitingQuestionMeta.ts`
- `../src/features/tools/lib/awaitingAnswerError.ts`
- `../src/features/timeline/lib/eventProcessorAwaiting.ts`
- `../src/features/composer/hooks/useComposerAwaiting.ts`

