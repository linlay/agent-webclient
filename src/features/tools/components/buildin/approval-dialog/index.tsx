import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Flex, Input, Radio, message } from "antd";
import type {
  AIAwaitApproval,
  AIAwaitApprovalDecision,
  AIAwaitApprovalOption,
  AIAwaitApprovalSubmitParamData,
  AIAwaitSubmitPayloadData,
  ApprovalActiveAwaiting,
} from "@/app/state/types";
import Style from "@/features/tools/components/buildin/confirm-dialog/index.module.css";

interface ApprovalDialogProps {
  data: ApprovalActiveAwaiting;
  onSubmit?: (payload: AIAwaitSubmitPayloadData) => Promise<unknown>;
  onResolvedByOther?: () => void;
}

const DEFAULT_APPROVAL_OPTIONS: AIAwaitApprovalOption[] = [
  {
    label: "同意",
    value: "approve",
    description: "只本次放行这条命令",
  },
  {
    label: "同意（本次运行同前缀都放行）",
    value: "approve_prefix_run",
    description: "本次 run 内同规则命令自动放行，不再重复询问",
  },
  {
    label: "拒绝",
    value: "reject",
    description: "终止这条命令",
  },
];

export function resolveApprovalOptions(
  approval: Pick<ApprovalActiveAwaiting["approvals"][number], "options">,
): AIAwaitApprovalOption[] {
  const normalized = Array.isArray(approval.options)
    ? approval.options.filter((option): option is AIAwaitApprovalOption => Boolean(option?.label) && Boolean(option?.value))
    : [];
  return normalized.length > 0
    ? normalized.map((option) => ({ ...option }))
    : DEFAULT_APPROVAL_OPTIONS.map((option) => ({ ...option }));
}

export function buildApprovalSubmitParams(
  approvals: AIAwaitApproval[],
  decisions: Record<string, AIAwaitApprovalDecision | undefined>,
  reasons: Record<string, string>,
): AIAwaitApprovalSubmitParamData[] {
  return approvals.map((approval) => ({
    id: approval.id,
    decision: decisions[approval.id] as AIAwaitApprovalDecision,
    ...(approval.allowFreeText && reasons[approval.id]?.trim()
      ? { reason: reasons[approval.id].trim() }
      : {}),
  }));
}

export const ApprovalDialog: React.FC<ApprovalDialogProps> = ({
  data,
  onSubmit,
  onResolvedByOther,
}) => {
  const resolvedByOtherHandledRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, AIAwaitApprovalDecision | undefined>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const readOnly = submitting || Boolean(data.resolvedByOther);

  useEffect(() => {
    if (!data.resolvedByOther) {
      resolvedByOtherHandledRef.current = false;
      return;
    }
    if (resolvedByOtherHandledRef.current) {
      return;
    }
    resolvedByOtherHandledRef.current = true;
    void message.info("已被其他终端提交");
    onResolvedByOther?.();
  }, [data.resolvedByOther, onResolvedByOther]);

  useEffect(() => {
    setDecisions((current) => {
      const next: Record<string, AIAwaitApprovalDecision | undefined> = {};
      data.approvals.forEach((approval) => {
        next[approval.id] = current[approval.id];
      });
      return next;
    });
    setReasons((current) => {
      const next: Record<string, string> = {};
      data.approvals.forEach((approval) => {
        next[approval.id] = current[approval.id] || "";
      });
      return next;
    });
  }, [data.approvals]);

  const canSubmit = useMemo(
    () => !readOnly && data.approvals.every((approval) => Boolean(decisions[approval.id])),
    [data.approvals, decisions, readOnly],
  );

  const submitDecision = useCallback(
    async () => {
      if (!onSubmit || readOnly) {
        return;
      }
      setSubmitting(true);
      try {
        await onSubmit({
          runId: data.runId,
          awaitingId: data.awaitingId,
          params: buildApprovalSubmitParams(data.approvals, decisions, reasons),
        });
      } finally {
        setSubmitting(false);
      }
    },
    [data.approvals, data.awaitingId, data.runId, decisions, onSubmit, readOnly, reasons],
  );

  return (
    <div className={Style.ConfirmDialog}>
      <Flex vertical gap={16} className={Style.QuestionWrapper}>
        <div className={Style.Question}>
          <Flex vertical gap={4} className={Style.QuestionText}>
            <span className={Style.QuestionHeading}>等待审批</span>
            <span className={Style.QuestionPrompt}>
              请确认是否继续执行以下操作
            </span>
          </Flex>
        </div>

        <Flex vertical gap={10} style={{ padding: "0 10px 10px" }}>
          {data.approvals.map((approval) => (
            <Flex
              key={approval.id}
              vertical
              gap={4}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div style={{ color: "var(--text-main)", fontWeight: 600 }}>
                {approval.command}
              </div>
              {approval.description && (
                <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  {approval.description}
                </div>
              )}
              <Radio.Group
                value={decisions[approval.id]}
                disabled={readOnly}
                onChange={(event) => {
                  setDecisions((current) => ({
                    ...current,
                    [approval.id]: event.target.value as AIAwaitApprovalDecision,
                  }));
                }}
              >
                <Flex vertical gap={8}>
                  {resolveApprovalOptions(approval).map((option) => (
                    <Radio key={`${approval.id}:${option.value}`} value={option.value}>
                      <Flex vertical gap={2}>
                        <span>{option.label}</span>
                        {option.description && (
                          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                            {option.description}
                          </span>
                        )}
                      </Flex>
                    </Radio>
                  ))}
                </Flex>
              </Radio.Group>
              {approval.allowFreeText && (
                <Input.TextArea
                  disabled={readOnly}
                  value={reasons[approval.id] || ""}
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  placeholder={approval.freeTextPlaceholder || "可选：填写理由"}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setReasons((current) => ({
                      ...current,
                      [approval.id]: nextValue,
                    }));
                  }}
                />
              )}
            </Flex>
          ))}
        </Flex>

        <Flex gap={10} justify="flex-end" align="center">
          <Button
            type="primary"
            disabled={!canSubmit}
            onClick={() => {
              void submitDecision();
            }}
            loading={submitting}
          >
            提交审批
          </Button>
        </Flex>
      </Flex>
    </div>
  );
};
