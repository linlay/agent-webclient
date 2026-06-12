import { message } from "antd";
import { Button, Checkbox, CheckboxRef, Flex, Input } from "antd/es";
import { EnterOutlined, LoadingOutlined } from "@ant-design/icons";
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
  AIAwaitPlan,
  AIAwaitPlanDecision,
  AIAwaitPlanOption,
  AIAwaitSubmitPayloadData,
  PlanActiveAwaiting,
} from "@/app/state/types";
import { useKeyboard } from "@/shared/utils/useKeyboard";
import { isEditableKeyboardTarget } from "@/features/tools/components/buildin/confirm-dialog/state";
import {
  buildPlanSubmitParam,
  resolvePlanOptions,
} from "@/features/tools/components/buildin/plan-dialog/state";
import { useI18n } from "@/shared/i18n";
import { debounce } from "lodash";
import Style from "./index.module.css";

interface PlanDialogProps {
  data: PlanActiveAwaiting;
  onSubmit?: (payload: AIAwaitSubmitPayloadData) => Promise<unknown>;
  onResolvedByOther?: () => void;
}

interface PlanQuestionRef {
  check: (index: number) => void;
  getElements: () => NodeListOf<HTMLElement> | undefined;
}

export const PlanDialog: React.FC<PlanDialogProps> = ({
  data,
  onSubmit,
  onResolvedByOther,
}) => {
  const { t } = useI18n();
  const planQuestionRef = useRef<PlanQuestionRef>(null);
  const resolvedByOtherHandledRef = useRef(false);
  const [submittingDecision, setSubmittingDecision] =
    useState<AIAwaitPlanDecision | null>(null);
  const [decision, setDecision] = useState<AIAwaitPlanDecision | undefined>();
  const [reason, setReason] = useState("");
  const plan = data.plan;
  const options = useMemo(() => resolvePlanOptions(plan), [plan]);
  const readOnly = Boolean(submittingDecision) || Boolean(data.resolvedByOther);
  const ready = Boolean(plan.id);

  useEffect(() => {
    setDecision(undefined);
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
    async (
      nextDecision: AIAwaitPlanDecision | undefined = decision,
      nextReason = reason,
    ) => {
      if (!onSubmit || readOnly) {
        return;
      }
      if (!nextDecision) {
        void message.warning(t("approvalDialog.selected"));
        return;
      }
      setSubmittingDecision(nextDecision);
      try {
        await onSubmit({
          runId: data.runId,
          awaitingId: data.awaitingId,
          params: [buildPlanSubmitParam(plan, nextDecision, nextReason)],
        });
      } finally {
        setSubmittingDecision(null);
      }
    },
    [
      data.awaitingId,
      data.runId,
      decision,
      onSubmit,
      plan,
      readOnly,
      reason,
      t,
    ],
  );

  useKeyboard({
    enabled: ready,
    getAllHost: () => planQuestionRef.current?.getElements(),
    onEnter: (element) => {
      const index = Number(element.dataset.index);
      if (!Number.isFinite(index)) {
        return;
      }
      planQuestionRef.current?.check(index);
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
      planQuestionRef.current?.check(Number(e.key) - 1);
    },
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      planQuestionRef.current?.getElements()?.[0]?.focus();
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [data.awaitingId, data.runId]);

  const doIgnore = useCallback(() => {
    if (readOnly) return;
    void submitDecision("reject", "跳过本次计划实施");
  }, [submitDecision]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Escape") {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      doIgnore();
    },
    [doIgnore],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return ready ? (
    <Flex className={Style.ConfirmDialog} vertical gap={4}>
      <PlanQuestion
        ref={planQuestionRef}
        plan={plan}
        readOnly={readOnly}
        reason={reason}
        onReasonChange={setReason}
        onEnter={submitDecision}
      />
    </Flex>
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

const PlanQuestion = forwardRef<
  PlanQuestionRef,
  {
    plan: AIAwaitPlan;
    readOnly: boolean;
    reason: string;
    onReasonChange: (nextReason: string) => void;
    onEnter: (nextDecision?: AIAwaitPlanDecision, nextReason?: string) => void;
  }
>(
  (
    {
      plan,
      readOnly,
      reason,
      onReasonChange,
      onEnter,
    },
    ref,
  ) => {
    const { t } = useI18n();
    const hostRef = useRef<HTMLDivElement>(null);
    const checkboxsRef = useRef<CheckboxRef[]>([]);

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
              {plan.title || "Implement this plan?"}
            </span>
          </Flex>
        </Flex>
        <Checkbox.Group className={Style.CheckboxGroup} disabled={readOnly}>
          <Checkbox
            ref={(checkboxRef) => {
              if (checkboxRef) {
                checkboxsRef.current[0] = checkboxRef;
              }
            }}
            className={Style.Option}
            onClick={() => {
              onEnter("approve");
            }}
          >
            <Flex
              gap={10}
              align="center"
              tabIndex={0}
              data-index={0}
              style={{ outline: "none" }}
            >
              <span className={Style.Index}>1</span>
              <span className={Style.Info}>是，实施此计划</span>
            </Flex>
          </Checkbox>
          <Checkbox
            ref={(checkboxRef) => {
              if (checkboxRef) {
                checkboxsRef.current[1] = checkboxRef;
              }
            }}
            className={Style.Option}
            onClick={() => {
              onEnter("reject", reason);
            }}
          >
            <Flex gap={10} align="center">
              <span className={Style.Index}>2</span>
              <span>否</span>
              <Input
                variant="borderless"
                placeholder="请告知如何调整"
                tabIndex={0}
                disabled={readOnly}
                onChange={(event) => {
                  onReasonChange(event.target.value);
                }}
                onPressEnter={(event) => {
                  const val = event.currentTarget.value.trim();
                  if (val) {
                    onEnter("reject", val);
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                style={{ padding: 0, fontSize: 12, borderRadius: 0 }}
              />
              <Button
                type="link"
                shape="round"
                className={Style.IgnoreButton}
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onEnter("reject", "跳过本次计划实施");
                }}
                disabled={readOnly}
              >
                {t("approvalDialog.action.skip")}
              </Button>
            </Flex>
          </Checkbox>
        </Checkbox.Group>
      </Flex>
    );
  },
);

PlanQuestion.displayName = "PlanQuestion";
