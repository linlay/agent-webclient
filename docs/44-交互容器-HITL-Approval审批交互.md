# HITL-Approval审批交互

## 当前状态
Approval awaiting 用于命令、规则或高风险动作审批。前端支持 approve、reject、approve_rule_run 等 decision，并可展示 command、ruleKey、description 和选项说明。

## 核心职责
- 归一化 approvals，保留合法 decision 和审批命令信息。
- 渲染审批对话框与 approve/reject 操作。
- 支持部分审批参数和聚合提交。
- 在 timeline answer 回显中用注册的 approval meta 补齐 command 与 ruleKey。

## 核心流程
收到 mode 为 approval 的 awaiting ask 后，`registerAwaitingApprovalMeta` 保存元数据，active awaiting 进入 approval 模式。用户选择决策后，`buildApprovalSubmitParams` 或相关聚合 builder 生成提交参数，提交到 `/api/submit` 并等待 answer 事件确认。

## 边界与非目标
- 前端不判断命令是否真的安全，只展示后端要求审批的信息。
- 审批规则持久化和权限校验由后端负责。
- Approval 不处理 HTML form 数据采集。

## 相关文件
- `../src/features/tools/lib/awaitingRuntime.ts`
- `../src/features/tools/lib/awaitingQuestionMeta.ts`
- `../src/features/tools/components/buildin/approval-dialog/index.tsx`
- `../src/features/tools/components/buildin/approval-dialog/state.ts`
- `../src/features/tools/components/protocol.ts`
- `../src/features/timeline/lib/eventProcessorAwaiting.ts`

