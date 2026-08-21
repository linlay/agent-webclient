import { message, Radio, Typography } from "antd";
import { Button, CheckboxRef, Flex, Input } from "antd/es";
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
  findApprovalDecisionError,
  resolveApprovalOptions,
} from "@/features/tools/components/buildin/approval-dialog/state";
import { useAwaitingTimeoutCountdown } from "@/features/tools/components/awaitingTimeout";
import { useAwaitingResolutionNotice } from "@/features/tools/components/buildin/useAwaitingResolutionNotice";
import { useI18n } from "@/shared/i18n";
import { debounce } from "lodash";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { Pager } from "@/shared/ui/Pager";
import {
  getHitlPaginationDotClassName,
  hitlDialogClassNames,
} from "@/features/tools/components/buildin/dialogClassNames";

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
      const error = findApprovalDecisionError(
        approvals,
        nextDecisions,
        nextReasons,
        t,
      );
      if (error) {
        setCurIndex(clampAwaitingIndex(error.index, approvals.length));
        void message.warning(error.message);
        return;
      }
      await submitPayload(
        buildApprovalSubmitParams(approvals, nextDecisions, nextReasons),
      );
    },
    [approvals, decisions, reasons, submitPayload, t],
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
    <div className={hitlDialogClassNames.surface}>
      <Pager
        index={curIndex}
        panels={approvals.map((approval, index) => (
          <ApprovalQuestion
            key={approval.id ?? index}
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
              <Flex
                className={hitlDialogClassNames.headerSide}
                align="center"
                gap={16}
              >
                {timeoutCountdown.label && (
                  <Flex className={hitlDialogClassNames.timeoutRow}>
                    <span>
                      {timeoutExpired && submitting
                        ? t("approvalDialog.status.autoSubmitting")
                        : t("approvalDialog.timeout.countdown", {
                            label: timeoutCountdown.label,
                          })}
                    </span>
                  </Flex>
                )}
                {approvals.length > 1 && (
                  <Flex className={hitlDialogClassNames.pagination} gap={6}>
                    {approvals?.map((item, index) => {
                      const value = decisions?.[item.id];
                      const skip = value === "reject";
                      const done = !skip && value;
                      return (
                        <span
                          key={item.id}
                          className={getHitlPaginationDotClassName({
                            active: index === curIndex,
                            done: Boolean(done),
                            skip,
                          })}
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
                    className={hitlDialogClassNames.button}
                    onClick={() => {
                      void moveForward();
                    }}
                    loading={submitting}
                    disabled={resolved || !currentDecision}
                  >
                    {t("approvalDialog.action.continue")}
                  </Button>
                )}
                {curIndex >= approvals.length - 1 && (
                  <Button
                    type="primary"
                    shape="round"
                    size="small"
                    className={hitlDialogClassNames.button}
                    onClick={() => {
                      void submitDecision();
                    }}
                    loading={submitting}
                    disabled={resolved}
                  >
                    <span>{t("approvalDialog.action.submit")}</span>
                    <MaterialIcon name="keyboard_return" />
                  </Button>
                )}
              </Flex>
            }
          />
        ))}
      />
    </div>
  ) : (
    <Flex
      className={hitlDialogClassNames.loadingSurface}
      vertical
      align="center"
      justify="center"
      gap={20}
    >
      <MaterialIcon
        name="progress_activity"
        className={hitlDialogClassNames.loadingIcon}
      />
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
    const { locale, t } = useI18n();
    const checkboxsRef = useRef<CheckboxRef[]>([]);
    const options = useMemo(
      () => resolveApprovalOptions(approval, t),
      [approval, locale, t],
    );
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
      <Flex
        vertical
        ref={hostRef}
        className={hitlDialogClassNames.questionWrapper}
      >
        <Flex
          className={hitlDialogClassNames.questionHeader}
          justify="space-between"
        >
          <div className={hitlDialogClassNames.questionHeading}>
            {approval?.description}
          </div>
          {pagnation}
        </Flex>
        <div className={hitlDialogClassNames.approvalDetails}>
          {approval?.command}
        </div>
        <Radio.Group
          className={hitlDialogClassNames.radioGroup}
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
              className={hitlDialogClassNames.radioOption}
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
                className="tw:outline-none"
              >
                <span className={hitlDialogClassNames.optionIndex}>
                  {index + 1}
                </span>
                <Typography.Text
                  className={hitlDialogClassNames.optionInfo}
                  ellipsis={{ tooltip: option.label }}
                >
                  {option.label}
                </Typography.Text>
                {option.description && (
                  <Typography.Text
                    className={hitlDialogClassNames.approvalMeta}
                    ellipsis={{ tooltip: option.description }}
                  >
                    {option.description}
                  </Typography.Text>
                )}
                <span className={hitlDialogClassNames.selectedBadge}>
                  {t("approvalDialog.selected")}
                </span>
              </Flex>
            </Radio>
          ))}
          {approval?.allowFreeText && (
            <Flex align="center">
              <Radio
                className={hitlDialogClassNames.approvalFreeTextOption}
                value="reject"
                ref={(checkboxRef) => {
                  if (checkboxRef) {
                    checkboxsRef.current[options?.length] = checkboxRef;
                  }
                }}
                onClick={() => {
                  onDecisionChange("reject");
                  onEnterDebounce("reject");
                }}
              >
                <Flex gap={10} align="center">
                  <span className={hitlDialogClassNames.optionIndex}>
                    {options?.length + 1}
                  </span>
                  <span className={hitlDialogClassNames.optionInfo}>
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
                    className="tw:p-0 tw:text-xs"
                  />
                </Flex>
              </Radio>
              {confirmSlot}
            </Flex>
          )}
        </Radio.Group>
      </Flex>
    );
  },
);

ApprovalQuestion.displayName = "ApprovalQuestion";
