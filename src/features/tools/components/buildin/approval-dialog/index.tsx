import { message } from "antd";
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
  AIAwaitApprovalDecision,
  AIAwaitSubmitPayloadData,
  ApprovalActiveAwaiting,
} from "@/app/state/types";
import { useKeyboard } from "@/shared/utils/useKeyboard";
import Style from "@/features/tools/components/buildin/confirm-dialog/index.module.css";
import {
  clampAwaitingIndex,
  isEditableKeyboardTarget,
} from "@/features/tools/components/buildin/confirm-dialog/state";
import {
  buildApprovalSubmitParams,
  resolveApprovalOptions,
} from "@/features/tools/components/buildin/approval-dialog/state";
import { debounce } from "lodash";

interface ApprovalDialogProps {
  data: ApprovalActiveAwaiting;
  onSubmit?: (payload: AIAwaitSubmitPayloadData) => Promise<unknown>;
  onResolvedByOther?: () => void;
}

interface ApprovalRef {
  check: (index: number) => void;
  getElements: () => NodeListOf<HTMLElement> | undefined;
}

export const ApprovalDialog: React.FC<ApprovalDialogProps> = ({
  data,
  onSubmit,
  onResolvedByOther,
}) => {
  const approvals = data.approvals;
  const approvalsRef = useRef<ApprovalRef[]>([]);
  const resolvedByOtherHandledRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [curIndex, setCurIndex] = useState(0);
  const [decisions, setDecisions] = useState<
    Record<string, AIAwaitApprovalDecision | undefined>
  >({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const readOnly = submitting || Boolean(data.resolvedByOther);
  const currentApproval = approvals[curIndex];
  const currentDecision = currentApproval
    ? decisions[currentApproval.id]
    : undefined;
  const ready = approvals.length > 0;

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
    async (nextDecisions = decisions, nextReasons = reasons) => {
      if (!onSubmit || readOnly || !hasAllDecisions(nextDecisions)) {
        return;
      }
      setSubmitting(true);
      try {
        await onSubmit({
          runId: data.runId,
          awaitingId: data.awaitingId,
          params: buildApprovalSubmitParams(
            approvals,
            nextDecisions,
            nextReasons,
          ),
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
    (approvalId: string, nextDecision: AIAwaitApprovalDecision | undefined) => {
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
      }
    },
    [approvals.length, doIgnore],
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
                approvals.length > 1 && (
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
                )
              }
            />
          ),
        }))}
      />
      <Flex gap={10} justify="flex-end" align="center">
        <Button
          type="link"
          shape="round"
          className={Style.IgnoreButton}
          size="small"
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
            size="small"
            onClick={() => {
              void moveForward();
            }}
            disabled={readOnly || !currentDecision}
          >
            继续
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
            <span>提交</span>
            <EnterOutlined />
          </Button>
        )}
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
      <div>等待审批加载中...</div>
    </Flex>
  );
};

const ApprovalQuestion = forwardRef<
  ApprovalRef,
  {
    approval: AIAwaitApproval;
    readOnly: boolean;
    decision?: AIAwaitApprovalDecision;
    reason: string;
    onDecisionChange: (
      nextDecision: AIAwaitApprovalDecision | undefined,
    ) => void;
    onReasonChange: (nextReason: string) => void;
    onEnter: (nextDecision?: AIAwaitApprovalDecision) => void;
    pagnation: React.ReactNode;
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
    },
    ref,
  ) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const checkboxsRef = useRef<CheckboxRef[]>([]);
    const options = useMemo(() => resolveApprovalOptions(approval), [approval]);
    const onEnterDebounce = useCallback(debounce(onEnter, 500), [onEnter]);

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
        <Flex className={Style.Question} align="baseline">
          <Flex vertical gap={4} className={Style.QuestionText}>
            <span className={Style.QuestionHeading}>
              请确认是否继续执行以下操作
            </span>
            <span className={Style.QuestionPrompt}>
              {approval?.description}
            </span>
          </Flex>
          {pagnation}
        </Flex>
        <div className={Style.ApprovalDetails}>{approval?.command}</div>
        <Checkbox.Group
          className={Style.CheckboxGroup}
          value={decision ? [decision] : []}
          disabled={readOnly}
          onChange={(keys) => {
            const last = keys.at(-1);
            const nextDecision =
              typeof last === "string"
                ? (last as AIAwaitApprovalDecision)
                : undefined;
            onDecisionChange(nextDecision);
            if (nextDecision) {
              onEnterDebounce(nextDecision);
            }
          }}
        >
          {options?.map((option, index) => (
            <Checkbox
              key={`${approval.id}:${option.decision}`}
              ref={(checkboxRef) => {
                if (checkboxRef) {
                  checkboxsRef.current[index] = checkboxRef;
                }
              }}
              value={option.decision}
              className={Style.Option}
            >
              <Flex
                gap={10}
                align="center"
                tabIndex={0}
                data-index={index}
                style={{ outline: "none" }}
              >
                <span>{index + 1}.</span>
                <span className={Style.Info}>{option.label}</span>
                {option.description && (
                  <span className={Style.ApprovalMeta}>
                    {option.description}
                  </span>
                )}
                <span className="Selected">已选</span>
              </Flex>
            </Checkbox>
          ))}
        </Checkbox.Group>
        {approval.allowFreeText && (
          <Flex className={[Style.Option, Style.FreeText].join(" ")} gap={10}>
            <span>{options?.length + 1}.</span>
            <Input
              variant="borderless"
              placeholder={approval.freeTextPlaceholder}
              value={reason}
              tabIndex={0}
              onChange={(e) => {
                onReasonChange(e.target.value);
              }}
              style={{ padding: 0 }}
            />
          </Flex>
        )}
      </Flex>
    );
  },
);

ApprovalQuestion.displayName = "ApprovalQuestion";
