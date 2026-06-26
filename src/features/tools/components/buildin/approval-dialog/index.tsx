import { Radio } from "antd";
import { Button, Checkbox, CheckboxRef, Flex, Input, Tabs } from "antd/es";
import {
  EnterOutlined,
  LeftOutlined,
  LoadingOutlined,
  RightOutlined,
} from "@ant-design/icons";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AIAwaitApproval,
  AIAwaitSubmitPayloadData,
  ApprovalActiveAwaiting,
} from "@/app/state/types";
import { useKeyboard } from "@/shared/utils/useKeyboard";
import {
  clampAwaitingIndex,
  isEditableKeyboardTarget,
} from "@/features/tools/components/buildin/confirm-dialog/state";
import {
  type ApprovalDialogDecision,
  buildPartialApprovalSubmitParams,
  buildApprovalSubmitParams,
  resolveApprovalOptions,
} from "@/features/tools/components/buildin/approval-dialog/state";
import { useAwaitingTimeoutCountdown } from "@/features/tools/components/awaitingTimeout";
import { useAwaitingResolutionNotice } from "@/features/tools/components/buildin/useAwaitingResolutionNotice";
import { useI18n } from "@/shared/i18n";
import { debounce } from "lodash";
import Style from "./index.module.css";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

interface ApprovalDialogProps {
  data: ApprovalActiveAwaiting;
  onSubmit?: (payload: AIAwaitSubmitPayloadData) => Promise<unknown>;
  onResolved?: () => void;
}

interface ApprovalRef {
  check: (index: number) => void;
  getElements: () => NodeListOf<HTMLElement> | undefined;
}

export const ApprovalDialog: React.FC<ApprovalDialogProps> = ({
  data,
  onSubmit,
  onResolved,
}) => {
  const { t } = useI18n();
  const approvals = data.approvals;
  const approvalsRef = useRef<ApprovalRef[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [timeoutExpired, setTimeoutExpired] = useState(false);
  const [curIndex, setCurIndex] = useState(0);
  const [decisions, setDecisions] = useState<
    Record<string, ApprovalDialogDecision | undefined>
  >({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const resolved = Boolean(data.resolutionReason);
  const readOnly = submitting || resolved;
  const currentApproval = approvals[curIndex];
  const currentDecision = currentApproval
    ? decisions[currentApproval.id]
    : undefined;
  const ready = approvals.length > 0;
  const defaultRejectReason = t("approvalDialog.rejectDefaultReason");

  const hasAllDecisions = useCallback(
    (
      nextDecisions: Record<string, ApprovalDialogDecision | undefined>,
      nextReasons: Record<string, string> = reasons,
    ) =>
      approvals.every((approval) => {
        const decision = nextDecisions[approval.id];
        if (!decision) {
          return false;
        }
        if (decision === "reject_with_reason") {
          return Boolean(nextReasons[approval.id]?.trim());
        }
        return true;
      }),
    [approvals],
  );

  const canSubmit = useMemo(
    () => !readOnly && hasAllDecisions(decisions, reasons),
    [decisions, hasAllDecisions, readOnly, reasons],
  );

  useAwaitingResolutionNotice({
    resolutionReason: data.resolutionReason,
    onResolved,
  });

  useEffect(() => {
    setDecisions({});
    setReasons({});
    setCurIndex(0);
    setTimeoutExpired(false);
  }, [data.awaitingId, data.runId]);

  useEffect(() => {
    setDecisions((current) => {
      const next: Record<string, ApprovalDialogDecision | undefined> = {};
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

  const submitPayload = useCallback(
    async (params: AIAwaitSubmitPayloadData["params"]) => {
      if (!onSubmit || submitting || resolved) {
        return;
      }
      setSubmitting(true);
      try {
        await onSubmit({
          runId: data.runId,
          awaitingId: data.awaitingId,
          params,
        });
      } finally {
        setSubmitting(false);
      }
    },
    [data.awaitingId, data.runId, onSubmit, resolved, submitting],
  );

  const submitDecision = useCallback(
    async (nextDecisions = decisions, nextReasons = reasons) => {
      if (readOnly || !hasAllDecisions(nextDecisions, nextReasons)) {
        return;
      }
      await submitPayload(
        buildApprovalSubmitParams(approvals, nextDecisions, nextReasons),
      );
    },
    [approvals, decisions, hasAllDecisions, readOnly, reasons, submitPayload],
  );

  const doSkip = useCallback(async () => {
    if (readOnly || approvals.length === 0 || !currentApproval) {
      return;
    }

    const nextDecisions = {
      ...decisions,
      [currentApproval.id]: "reject" as const,
    };
    const nextReasons = {
      ...reasons,
      [currentApproval.id]: defaultRejectReason,
    };

    setDecisions(nextDecisions);
    setReasons(nextReasons);

    if (curIndex >= approvals.length - 1) {
      if (!hasAllDecisions(nextDecisions)) {
        return;
      }
      await submitPayload(
        buildApprovalSubmitParams(approvals, nextDecisions, nextReasons).map(
          (param) =>
            param.id === currentApproval.id && param.decision === "reject"
              ? { ...param, reason: defaultRejectReason }
              : param,
        ),
      );
      return;
    }

    setCurIndex((prev) => Math.min(approvals.length - 1, prev + 1));
  }, [
    approvals,
    curIndex,
    currentApproval,
    decisions,
    defaultRejectReason,
    hasAllDecisions,
    readOnly,
    reasons,
    submitPayload,
  ]);

  const handleAutoSubmit = useCallback(() => {
    if (submitting || resolved) {
      return;
    }
    setTimeoutExpired(true);
    void submitPayload(
      buildPartialApprovalSubmitParams(approvals, decisions, reasons),
    );
  }, [approvals, resolved, decisions, reasons, submitPayload, submitting]);

  const timeoutCountdown = useAwaitingTimeoutCountdown({
    awaitingKey: data.key,
    timeout: data.timeout,
    createdAt: data.createdAt,
    onExpire: handleAutoSubmit,
  });

  const moveForward = useCallback(
    async (nextDecision?: ApprovalDialogDecision) => {
      if (readOnly || approvals.length === 0 || !currentApproval) {
        return;
      }

      const selectedDecision = nextDecision ?? decisions[currentApproval.id];
      if (!selectedDecision) {
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
    [
      approvals.length,
      curIndex,
      currentApproval,
      decisions,
      readOnly,
      reasons,
      submitDecision,
    ],
  );

  const handleDecisionChange = useCallback(
    (approvalId: string, nextDecision: ApprovalDialogDecision | undefined) => {
      setDecisions((current) => ({
        ...current,
        [approvalId]: nextDecision,
      }));
    },
    [],
  );

  useKeyboard({
    enabled: ready,
    getAllHost: () => approvalsRef.current[curIndex]?.getElements(),
    onEnter: (element) => {
      const index = Number(element.dataset.index);
      if (!Number.isFinite(index)) {
        return;
      }
      approvalsRef.current[curIndex]?.check(index);
    },
    onKeyDown: (e) => {
      if (isEditableKeyboardTarget(e.target)) {
        return;
      }
      if (!/^[1-9]$/.test(e.key)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      approvalsRef.current[curIndex]?.check(Number(e.key) - 1);
    },
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      approvalsRef.current[curIndex]?.getElements()?.[0]?.focus();
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [curIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isEditableKeyboardTarget(e.target)) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          void doSkip();
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
        void doSkip();
      }
    },
    [approvals.length, doSkip],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return ready ? (
    <div className={Style.ConfirmDialog}>
      <Tabs
        activeKey={curIndex.toString()}
        onChange={(key) =>
          setCurIndex(clampAwaitingIndex(Number(key), approvals.length))
        }
        renderTabBar={() => null as any}
        items={approvals.map((approval, index) => ({
          key: index.toString(),
          label: approval.id,
          children: (
            <ApprovalQuestion
              ref={(ref) => {
                if (ref) {
                  approvalsRef.current[index] = ref;
                }
              }}
              approval={approval}
              readOnly={readOnly}
              decision={decisions[approval.id]}
              reason={reasons[approval.id] || ""}
              onDecisionChange={(nextDecision) => {
                handleDecisionChange(approval.id, nextDecision);
              }}
              onReasonChange={(nextReason) => {
                setReasons((current) => ({
                  ...current,
                  [approval.id]: nextReason,
                }));
              }}
              onEnter={(nextDecision) => {
                void moveForward(nextDecision);
              }}
              pagnation={
                <Flex className={Style.HeaderSide} align="center" gap={16}>
                  {timeoutCountdown.label && (
                    <Flex className={Style.TimeoutRow}>
                      <span className={Style.TimeoutBadge}>
                        {timeoutExpired && submitting
                          ? t("approvalDialog.status.autoSubmitting")
                          : t("approvalDialog.timeout.countdown", {
                              label: timeoutCountdown.label,
                            })}
                      </span>
                    </Flex>
                  )}
                  {approvals.length > 1 && (
                    <Flex className={Style.Pagination} gap={6}>
                      {approvals?.map((item, index) => {
                        const value = decisions?.[item.id];
                        const skip = value === "reject";
                        const done = !skip && value;
                        return (
                          <span
                            key={item.id}
                            className={[
                              Style.Item,
                              index === curIndex ? Style.Active : "",
                              done ? Style.Done : "",
                              skip ? Style.Skip : "",
                            ].join(" ")}
                            onClick={() => setCurIndex(index)}
                          ></span>
                        );
                      })}
                    </Flex>
                  )}
                </Flex>
              }
              confirmSlot={
                <Flex gap={10} align="center">
                  {curIndex < approvals.length - 1 && (
                    <Button
                      type="primary"
                      shape="round"
                      size="small"
                      onClick={() => {
                        void moveForward();
                      }}
                      disabled={readOnly || !currentDecision}
                    >
                      {t("approvalDialog.action.continue")}
                    </Button>
                  )}
                  {curIndex >= approvals.length - 1 && (
                    <Button
                      type="primary"
                      shape="round"
                      size="small"
                      onClick={() => {
                        void submitDecision();
                      }}
                      loading={submitting}
                      disabled={!canSubmit}
                    >
                      <span>{t("approvalDialog.action.submit")}</span>
                      <EnterOutlined />
                    </Button>
                  )}
                </Flex>
              }
            />
          ),
        }))}
      />
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

const ApprovalQuestion = forwardRef<
  ApprovalRef,
  {
    approval: AIAwaitApproval;
    readOnly: boolean;
    decision?: ApprovalDialogDecision;
    reason: string;
    onDecisionChange: (
      nextDecision: ApprovalDialogDecision | undefined,
    ) => void;
    onReasonChange: (nextReason: string) => void;
    onEnter: (nextDecision?: ApprovalDialogDecision) => void;
    pagnation: React.ReactNode;
    confirmSlot: React.ReactNode;
  }
>(
  (
    {
      approval,
      readOnly,
      decision,
      reason,
      onDecisionChange,
      onReasonChange,
      onEnter,
      pagnation,
      confirmSlot,
    },
    ref,
  ) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const { t } = useI18n();
    const checkboxsRef = useRef<CheckboxRef[]>([]);
    const options = useMemo(() => resolveApprovalOptions(approval), [approval]);
    const onEnterDebounce = useCallback(debounce(onEnter, 300), [onEnter]);

    useImperativeHandle(
      ref,
      () => ({
        getElements: () => {
          return hostRef.current?.querySelectorAll('[tabIndex="0"]');
        },
        check: (index: number) => {
          checkboxsRef.current[index]?.input?.click();
        },
      }),
      [],
    );

    return (
      <Flex vertical ref={hostRef} className={Style.QuestionWrapper}>
        <Flex className={Style.Question} justify="space-between">
          <div className={Style.QuestionHeading}>{approval?.description}</div>
          {pagnation}
        </Flex>
        <div className={Style.ApprovalDetails}>{approval?.command}</div>
        <Radio.Group
          className={Style.RadioGroup}
          value={decision}
          disabled={readOnly}
        >
          {options?.map((option, index) => (
            <Radio
              key={`${approval.id}:${option.decision}`}
              ref={(checkboxRef) => {
                if (checkboxRef) {
                  checkboxsRef.current[index] = checkboxRef;
                }
              }}
              value={option.decision}
              className={Style.Option}
              onClick={() => {
                const val = option?.decision as ApprovalDialogDecision;
                onDecisionChange(val);
                onEnterDebounce(val);
              }}
            >
              <Flex
                gap={10}
                align="center"
                tabIndex={0}
                data-index={index}
                style={{ outline: "none" }}
              >
                <span className={Style.Index}>{index + 1}</span>
                <span className={Style.Info}>{option.label}</span>
                {option.description && (
                  <span className={Style.ApprovalMeta}>
                    {option.description}
                  </span>
                )}
                <span className="Selected">{t("approvalDialog.selected")}</span>
              </Flex>
            </Radio>
          ))}
          <Flex align="center">
            <Radio
              className={[Style.Option, Style.FreeText].join(" ")}
              value="reject"
              onClick={() => {
                onDecisionChange("reject");
                onEnterDebounce("reject");
              }}
            >
              <Flex gap={10} align="center">
                <span className={Style.Index}>
                  <MaterialIcon name="edit" />
                </span>
                <span className={Style.Info}>
                  {t("approvalDialog.option.reject")}
                </span>
                <Input
                  variant="borderless"
                  placeholder={t("approvalDialog.rejectPlaceholder")}
                  value={reason}
                  tabIndex={0}
                  onChange={(e) => {
                    const nextReason = e.target.value;
                    onReasonChange(nextReason);
                    if (nextReason.trim()) {
                      onDecisionChange("reject");
                    }
                  }}
                  onPressEnter={(e) => {
                    const nextReason = e.currentTarget.value.trim();
                    if (!nextReason) {
                      return;
                    }
                    onEnterDebounce("reject");
                  }}
                  style={{ padding: 0 }}
                />
              </Flex>
            </Radio>
            {confirmSlot}
          </Flex>
        </Radio.Group>
      </Flex>
    );
  },
);

ApprovalQuestion.displayName = "ApprovalQuestion";
