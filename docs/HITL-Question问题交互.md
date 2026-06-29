# HITL-Question问题交互

## 当前状态
Question awaiting 用于后端向用户提出一个或多个问题，支持文本、选择、多选和自由输入等形态。前端归一化问题结构后，在 Composer awaiting shell 中渲染输入控件，并提交 answer params。

## 核心职责
- 归一化 `questions` 数组，过滤无 id 或无 question 的项。
- 支持 select、multi-select、free text 等问题类型。
- 根据问题元数据生成 placeholder、heading、prompt 和选项展示。
- 提交时构造 question answer 参数，并记录 submitId 避免重复提交。

## 核心流程
`reduceActiveAwaiting` 识别 mode 为 question 的事件并注册问题元数据。Composer awaiting UI 读取 active awaiting，用户完成回答后由 question submit builder 生成参数，通过 awaiting submit 接口提交。answer 事件到达后，timeline 显示已提交摘要。

## 边界与非目标
- Question 只回答问题，不承载命令审批语义。
- 多问题聚合提交必须保持 runId + awaitingId + item id 的映射。
- 选项描述和 previewHtml 只用于前端展示，不代表后端校验规则。

## 相关文件
- `../src/features/tools/lib/awaitingRuntime.ts`
- `../src/features/tools/lib/awaitingQuestionMeta.ts`
- `../src/features/tools/components/protocol.ts`
- `../src/features/tools/components/buildin/confirm-dialog/state.ts`
- `../src/features/composer/components/AwaitingShell.tsx`
- `../src/features/composer/hooks/useComposerAwaiting.ts`

