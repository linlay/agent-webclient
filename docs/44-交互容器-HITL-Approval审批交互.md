# HITL-Approval审批交互

## 当前状态
Approval awaiting 用于命令、规则或高风险动作审批。前端支持 approve、reject、approve_rule_run 等 decision，并展示 command、ruleKey、审批项级 description 和本地化选项说明。

`AIAwaitApprovalOption` 是 wire DTO，不含 `description`；`normalizeApprovals` 不再读取或保留旧后端选项中的该字段。`resolveApprovalOptions` 返回独立的 `ApprovalDialogOption` 展示类型，按 decision 和当前语言生成 label 与 description：approve 显示“只本次放行”，approve_rule_run 显示本次 Run 同规则放行说明，reject 不显示说明。审批项级 `approval.description` 继续用于审批标题；Question 选项的 description 继续用于 Tooltip。

原生 Approval 选项示例：

```json
{
  "id": "tool_1",
  "command": "echo ok",
  "description": "执行命令用途说明",
  "options": [
    { "decision": "approve" },
    { "decision": "approve_rule_run" }
  ]
}
```

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
- `../src/features/tools/lib/protocol.ts`
- `../src/features/events/lib/processors/eventProcessorAwaiting.ts`
