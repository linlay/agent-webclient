import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Flex, Input, Radio, message } from "antd";
import type {
  AIAwaitApprovalDecision,
  AIAwaitSubmitPayloadData,
  ApprovalActiveAwaiting,
} from "@/app/state/types";
import Style from "@/features/tools/components/buildin/confirm-dialog/index.module.css";
import {
  buildApprovalSubmitParams,
  resolveApprovalOptions,
} from "@/features/tools/components/buildin/approval-dialog/state";

interface ApprovalDialogProps {
  data: ApprovalActiveAwaiting;
  onSubmit?: (payload: AIAwaitSubmitPayloadData) => Promise<unknown>;
  onResolvedByOther?: () => void;
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
