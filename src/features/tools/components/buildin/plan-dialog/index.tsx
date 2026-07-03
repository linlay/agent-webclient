import { message } from "antd";
import { Button, Checkbox, CheckboxRef, Flex, Input } from "antd/es";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type {
  AIAwaitPlan,
  AIAwaitPlanDecision,
  AIAwaitSubmitPayloadData,
  PlanActiveAwaiting,
} from "@/app/state/types";
import { useKeyboard } from "@/shared/utils/useKeyboard";
import { isEditableKeyboardTarget } from "@/features/tools/components/buildin/confirm-dialog/state";
import { buildPlanSubmitParam } from "@/features/tools/components/buildin/plan-dialog/state";
import { useAwaitingResolutionNotice } from "@/features/tools/components/buildin/useAwaitingResolutionNotice";
import { useI18n } from "@/shared/i18n";
import { hitlDialogClassNames } from "@/features/tools/components/buildin/dialogClassNames";

interface PlanDialogProps {
  data: PlanActiveAwaiting;
  onSubmit?: (payload: AIAwaitSubmitPayloadData) => Promise<unknown>;
  onResolved?: () => void;
}

interface PlanQuestionRef {
  check: (index: number) => void;
  getElements: () => NodeListOf<HTMLElement> | undefined;
}

export const PlanDialog: React.FC<PlanDialogProps> = ({
  data,
  onSubmit,
  onResolved,
}) => {
  const { t } = useI18n();
  const planQuestionRef = useRef<PlanQuestionRef>(null);
  const [submittingDecision, setSubmittingDecision] =
    useState<AIAwaitPlanDecision | null>(null);
  const [reason, setReason] = useState("");
  const plan = data.plan;
  const resolved = Boolean(data.resolutionReason);
  const readOnly = Boolean(submittingDecision) || resolved;
  const ready = Boolean(plan.id);

  useEffect(() => {
    setReason("");
    setSubmittingDecision(null);
  }, [data.awaitingId, data.runId]);

  useAwaitingResolutionNotice({
    resolutionReason: data.resolutionReason,
    onResolved,
  });

  const submitDecision = useCallback(
    async (nextDecision?: AIAwaitPlanDecision, nextReason = reason) => {
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
    [data.awaitingId, data.runId, onSubmit, plan, readOnly, reason, t],
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
    void submitDecision("reject", t("planDialog.skipReason"));
  }, [readOnly, submitDecision, t]);

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
    <Flex className={hitlDialogClassNames.surface} vertical gap={4}>
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

const PlanQuestion = forwardRef<
  PlanQuestionRef,
  {
    plan: AIAwaitPlan;
    readOnly: boolean;
    reason: string;
    onReasonChange: (nextReason: string) => void;
    onEnter: (nextDecision?: AIAwaitPlanDecision, nextReason?: string) => void;
  }
>(({ plan, readOnly, reason, onReasonChange, onEnter }, ref) => {
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
    <Flex
      vertical
      ref={hostRef}
      className={hitlDialogClassNames.questionWrapper}
    >
      <Flex
        className={hitlDialogClassNames.planQuestionHeader}
        align="baseline"
      >
        <Flex vertical gap={4} className={hitlDialogClassNames.questionText}>
          <span className={hitlDialogClassNames.planQuestionHeading}>
            {plan.title || t("planDialog.titleFallback")}
          </span>
        </Flex>
      </Flex>
      <Checkbox.Group
        className={hitlDialogClassNames.planCheckboxGroup}
        disabled={readOnly}
      >
        <Checkbox
          ref={(checkboxRef) => {
            if (checkboxRef) {
              checkboxsRef.current[0] = checkboxRef;
            }
          }}
          className={hitlDialogClassNames.planOption}
          onClick={() => {
            onEnter("approve");
          }}
        >
          <Flex
            gap={10}
            align="center"
            tabIndex={0}
            data-index={0}
            className="tw:outline-none"
          >
            <span className={hitlDialogClassNames.optionIndex}>1</span>
            <span className={hitlDialogClassNames.optionInfoPlain}>
              {t("planDialog.option.approve")}
            </span>
          </Flex>
        </Checkbox>
        <Checkbox
          ref={(checkboxRef) => {
            if (checkboxRef) {
              checkboxsRef.current[1] = checkboxRef;
            }
          }}
          className={hitlDialogClassNames.planOption}
          onClick={() => {
            onEnter("reject", reason);
          }}
        >
          <Flex gap={10} align="center">
            <span className={hitlDialogClassNames.optionIndex}>2</span>
            <span>{t("planDialog.option.reject")}</span>
            <Input
              variant="borderless"
              placeholder={t("planDialog.rejectPlaceholder")}
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
              className="tw:rounded-none tw:p-0 tw:text-xs"
            />
            <Button
              type="link"
              shape="round"
              className={hitlDialogClassNames.skipButton}
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onEnter("reject", t("planDialog.skipReason"));
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
});

PlanQuestion.displayName = "PlanQuestion";
