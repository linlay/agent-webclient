import { message } from "antd";
import { Button, Flex, Input } from "antd/es";
import { EnterOutlined, LoadingOutlined } from "@ant-design/icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AIAwaitPlanDecision,
  AIAwaitSubmitPayloadData,
  PlanActiveAwaiting,
} from "@/app/state/types";
import Style from "@/features/tools/components/buildin/confirm-dialog/index.module.css";
import {
  buildPlanSubmitParam,
  resolvePlanOptions,
} from "@/features/tools/components/buildin/plan-dialog/state";
import { useI18n } from "@/shared/i18n";

interface PlanDialogProps {
  data: PlanActiveAwaiting;
  onSubmit?: (payload: AIAwaitSubmitPayloadData) => Promise<unknown>;
  onResolvedByOther?: () => void;
}

export const PlanDialog: React.FC<PlanDialogProps> = ({
  data,
  onSubmit,
  onResolvedByOther,
}) => {
  const { t } = useI18n();
  const resolvedByOtherHandledRef = useRef(false);
  const [submittingDecision, setSubmittingDecision] =
    useState<AIAwaitPlanDecision | null>(null);
  const [reason, setReason] = useState("");
  const plan = data.plan;
  const options = useMemo(() => resolvePlanOptions(plan), [plan]);
  const rejectOption = options.find((option) => option.decision === "reject");
  const readOnly = Boolean(submittingDecision) || Boolean(data.resolvedByOther);
  const ready = Boolean(plan.id);

  useEffect(() => {
    setReason("");
    setSubmittingDecision(null);
  }, [data.awaitingId, data.runId]);

  useEffect(() => {
    if (!data.resolvedByOther) {
      resolvedByOtherHandledRef.current = false;
      return;
    }
    if (resolvedByOtherHandledRef.current) {
      return;
    }
    resolvedByOtherHandledRef.current = true;
    void message.info(t("approvalDialog.resolvedByOther"));
    onResolvedByOther?.();
  }, [data.resolvedByOther, onResolvedByOther, t]);

  const submitDecision = useCallback(
    async (decision: AIAwaitPlanDecision) => {
      if (!onSubmit || readOnly) {
        return;
      }
      setSubmittingDecision(decision);
      try {
        await onSubmit({
          runId: data.runId,
          awaitingId: data.awaitingId,
          params: [buildPlanSubmitParam(plan, decision, reason)],
        });
      } finally {
        setSubmittingDecision(null);
      }
    },
    [data.awaitingId, data.runId, onSubmit, plan, readOnly, reason],
  );

  return ready ? (
    <div className={Style.ConfirmDialog}>
      <Flex vertical className={Style.QuestionWrapper}>
        <Flex className={Style.Question} align="baseline">
          <Flex vertical gap={4} className={Style.QuestionText}>
            <span className={Style.QuestionHeading}>
              {plan.title || "Implement this plan?"}
            </span>
            {plan.planningId && (
              <span className={Style.QuestionPrompt}>{plan.planningId}</span>
            )}
          </Flex>
        </Flex>
        {rejectOption?.input && (
          <Flex className={[Style.Option, Style.FreeText].join(" ")} gap={10}>
            <Input.TextArea
              className={Style.ApprovalReason}
              autoSize={{ minRows: 2, maxRows: 4 }}
              disabled={readOnly}
              placeholder={rejectOption.input.placeholder}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Flex>
        )}
      </Flex>
      <Flex gap={10} align="center" className={Style.FooterRow}>
        {options.map((option) => (
          <Button
            key={option.decision}
            type={option.decision === "approve" ? "primary" : "default"}
            danger={option.decision === "reject"}
            shape="round"
            size="small"
            loading={submittingDecision === option.decision}
            disabled={readOnly || !onSubmit}
            onClick={() => {
              void submitDecision(option.decision);
            }}
          >
            <span>{option.label}</span>
            {option.decision === "approve" && <EnterOutlined />}
          </Button>
        ))}
      </Flex>
    </div>
  ) : (
    <Flex
      className={Style.ConfirmDialog}
      vertical
      align="center"
      justify="center"
      gap={20}
      style={{ minHeight: 200, color: "var(--colorTextSecondary)" }}
    >
      <LoadingOutlined style={{ color: "var(--colorPrimary)" }} />
      <div>{t("approvalDialog.loading")}</div>
    </Flex>
  );
};
