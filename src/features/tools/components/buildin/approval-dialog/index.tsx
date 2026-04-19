import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Flex, Input, message } from "antd";
import type {
  AIAwaitApprovalDecision,
  AIAwaitSubmitPayloadData,
  ApprovalActiveAwaiting,
} from "@/app/state/types";
import Style from "@/features/tools/components/buildin/confirm-dialog/index.module.css";

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
  const [loadingDecision, setLoadingDecision] =
    useState<AIAwaitApprovalDecision | null>(null);
  const [reason, setReason] = useState("");

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

  const submitDecision = useCallback(
    async (decision: AIAwaitApprovalDecision) => {
      if (!onSubmit) {
        return;
      }
      setLoadingDecision(decision);
      try {
        await onSubmit({
          runId: data.runId,
          awaitingId: data.awaitingId,
          params: data.approvals.map((approval) => ({
            id: approval.id,
            decision,
            ...(decision === "reject" && reason.trim()
              ? { reason: reason.trim() }
              : {}),
          })),
        });
      } finally {
        setLoadingDecision(null);
      }
    },
    [data.approvals, data.awaitingId, data.runId, onSubmit, reason],
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
              {approval.level && (
                <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  等级：{approval.level}
                </div>
              )}
            </Flex>
          ))}

          <Input.TextArea
            value={reason}
            autoSize={{ minRows: 2, maxRows: 4 }}
            placeholder="拒绝原因（可选）"
            onChange={(e) => setReason(e.target.value)}
          />
        </Flex>

        <Flex gap={10} justify="flex-end" align="center">
          <Button
            onClick={() => {
              void submitDecision("reject");
            }}
            loading={loadingDecision === "reject"}
          >
            驳回
          </Button>
          <Button
            type="primary"
            onClick={() => {
              void submitDecision("approve");
            }}
            loading={loadingDecision === "approve"}
          >
            批准
          </Button>
        </Flex>
      </Flex>
    </div>
  );
};

