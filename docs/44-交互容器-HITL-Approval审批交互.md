# HITL-Approval审批交互

## 当前状态
Approval awaiting 用于命令、规则或高风险动作审批。前端支持 approve、reject、approve_rule_run 等 decision。卡片保留工具用途说明，结构化原因可用时给出一句摘要，并允许展开查看完整命令和待人工确认的原因。命令可复制。

审批原因优先读取 `policy` 的待人工确认叶节点。图片等审批可直接提供外层 `requirements`。前端按 `reasonCode` 和 `subject` 本地化，旧记录及未知代码可在展开层显示原始原因。审批项级 `description` 仍用于工具用途说明。

`AIAwaitApprovalOption` 只携带决策。客户端根据当前语言说明仅批准本次或本轮规则复用。Host Bash 支持本轮复用时，以审批项公开的 `ruleKey` 匹配具体主规则，未匹配时使用通用提示。客户端沿用后端下发的批准选项与现有提交字段。

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
