import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Flex, Input, Radio, Tabs, message } from "antd";
import {
  EnterOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import type {
  AIAwaitApprovalDecision,
  AIAwaitSubmitPayloadData,
  ApprovalActiveAwaiting,
} from "@/app/state/types";
import Style from "@/features/tools/components/buildin/confirm-dialog/index.module.css";
import {
  clampAwaitingIndex,
  isEditableKeyboardTarget,
} from "@/features/tools/components/buildin/confirm-dialog/state";
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
  const approvals = data.approvals;
  const resolvedByOtherHandledRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [curIndex, setCurIndex] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, AIAwaitApprovalDecision | undefined>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const readOnly = submitting || Boolean(data.resolvedByOther);
  const currentApproval = approvals[curIndex];

  const hasAllDecisions = useCallback(
    (nextDecisions: Record<string, AIAwaitApprovalDecision | undefined>) =>
      approvals.every((approval) => Boolean(nextDecisions[approval.id])),
    [approvals],
  );

  const canSubmit = useMemo(
    () => !readOnly && hasAllDecisions(decisions),
    [decisions, hasAllDecisions, readOnly],
  );

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
    setDecisions({});
    setReasons({});
    setCurIndex(0);
  }, [data.awaitingId, data.runId]);

  useEffect(() => {
    setDecisions((current) => {
      const next: Record<string, AIAwaitApprovalDecision | undefined> = {};
      approvals.forEach((approval) => {
        next[approval.id] = current[approval.id];
      });
      return next;
    });
    setReasons((current) => {
      const next: Record<string, string> = {};
      approvals.forEach((approval) => {
        next[approval.id] = current[approval.id] || "";
      });
      return next;
    });
    setCurIndex((prev) => clampAwaitingIndex(prev, approvals.length));
  }, [approvals]);

  const submitDecision = useCallback(
    async (
      nextDecisions = decisions,
      nextReasons = reasons,
    ) => {
      if (!onSubmit || readOnly || !hasAllDecisions(nextDecisions)) {
        return;
      }
      setSubmitting(true);
      try {
        await onSubmit({
          runId: data.runId,
          awaitingId: data.awaitingId,
          params: buildApprovalSubmitParams(approvals, nextDecisions, nextReasons),
        });
      } finally {
        setSubmitting(false);
      }
    },
    [
      approvals,
      data.awaitingId,
      data.runId,
      decisions,
      hasAllDecisions,
      onSubmit,
      readOnly,
      reasons,
    ],
  );

  const doIgnore = useCallback(() => {
    if (!onSubmit || readOnly) {
      return;
    }
    void onSubmit({
      runId: data.runId,
      awaitingId: data.awaitingId,
      params: [],
    });
  }, [data.awaitingId, data.runId, onSubmit, readOnly]);

  const moveForward = useCallback(
    async (nextDecision?: AIAwaitApprovalDecision) => {
      if (readOnly || approvals.length === 0 || !currentApproval) {
        return;
      }

      const currentDecision = nextDecision ?? decisions[currentApproval.id];
      if (!currentDecision) {
        return;
      }

      if (curIndex >= approvals.length - 1) {
        const nextDecisions = nextDecision
          ? {
              ...decisions,
              [currentApproval.id]: nextDecision,
            }
          : decisions;
        await submitDecision(nextDecisions, reasons);
        return;
      }

      setCurIndex((prev) => Math.min(approvals.length - 1, prev + 1));
    },
    [approvals, curIndex, currentApproval, decisions, readOnly, reasons, submitDecision],
  );

  const handleDecisionChange = useCallback(
    (approvalId: string, nextDecision: AIAwaitApprovalDecision) => {
      setDecisions((current) => ({
        ...current,
        [approvalId]: nextDecision,
      }));
      void moveForward(nextDecision);
    },
    [moveForward],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isEditableKeyboardTarget(e.target)) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          doIgnore();
        }
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        setCurIndex((prev) => clampAwaitingIndex(prev + 1, approvals.length));
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        setCurIndex((prev) => clampAwaitingIndex(prev - 1, approvals.length));
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        doIgnore();
        return;
      }

      if (!/^[1-9]$/.test(e.key) || !currentApproval || readOnly) {
        return;
      }

      const options = resolveApprovalOptions(currentApproval);
      const nextOption = options[Number(e.key) - 1];
      if (!nextOption) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      handleDecisionChange(
        currentApproval.id,
        nextOption.decision as AIAwaitApprovalDecision,
      );
    },
    [approvals.length, currentApproval, doIgnore, handleDecisionChange, readOnly],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <div className={Style.ConfirmDialog}>
      <Flex vertical gap={16} className={Style.QuestionWrapper}>
        <Tabs
          activeKey={curIndex.toString()}
          onChange={(key) => setCurIndex(clampAwaitingIndex(Number(key), approvals.length))}
          renderTabBar={() => null as any}
          items={approvals.map((approval, index) => ({
            key: index.toString(),
            label: approval.id,
            children: (
              <Flex vertical gap={10}>
                <div className={Style.Question}>
                  <Flex vertical gap={4} className={Style.QuestionText}>
                    <span className={Style.QuestionHeading}>等待审批</span>
                    <span className={Style.QuestionPrompt}>
                      请确认是否继续执行以下操作
                    </span>
                  </Flex>
                  {approvals.length > 1 && (
                    <Flex className={Style.Pagination} align="center" gap={10}>
                      <Button
                        disabled={curIndex <= 0}
                        icon={<LeftOutlined style={{ fontSize: 12 }} />}
                        size="small"
                        type="text"
                        onClick={() => setCurIndex(curIndex - 1)}
                      />
                      <span>
                        {curIndex + 1} / {approvals.length}
                      </span>
                      <Button
                        size="small"
                        type="text"
                        disabled={curIndex >= approvals.length - 1}
                        icon={<RightOutlined style={{ fontSize: 12 }} />}
                        onClick={() => setCurIndex(curIndex + 1)}
                      />
                    </Flex>
                  )}
                </div>

                <Flex
                  vertical
                  gap={4}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    margin: "0 10px",
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
                      handleDecisionChange(
                        approval.id,
                        event.target.value as AIAwaitApprovalDecision,
                      );
                    }}
                  >
                    <Flex vertical gap={8}>
                      {resolveApprovalOptions(approval).map((option) => (
                        <Radio key={`${approval.id}:${option.decision}`} value={option.decision}>
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
              </Flex>
            ),
          }))}
        />

        <Flex gap={10} justify="flex-end" align="center">
          <Button
            type="link"
            shape="round"
            className={Style.IgnoreButton}
            onClick={doIgnore}
            disabled={readOnly}
          >
            <span>忽略</span>
            <span>ESC</span>
          </Button>
          {curIndex < approvals.length - 1 && (
            <Button
              type="primary"
              shape="round"
              onClick={() => {
                void moveForward();
              }}
              disabled={readOnly}
            >
              继续
            </Button>
          )}
          {curIndex >= approvals.length - 1 && approvals.length > 0 && (
            <Button
              type="primary"
              shape="round"
              onClick={() => {
                void submitDecision();
              }}
              loading={submitting}
              disabled={!canSubmit}
            >
              <span>提交</span>
              <EnterOutlined />
            </Button>
          )}
        </Flex>
      </Flex>
    </div>
  );
};
