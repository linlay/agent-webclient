import { message } from "antd";
import { Button, Checkbox, CheckboxRef, Flex, Input } from "antd/es";
import { LoadingOutlined } from "@ant-design/icons";
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
import { useResolvedByOtherNotice } from "@/features/tools/components/buildin/useResolvedByOtherNotice";
import { useI18n } from "@/shared/i18n";
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
  const [submittingDecision, setSubmittingDecision] =
    useState<AIAwaitPlanDecision | null>(null);
  const [reason, setReason] = useState("");
  const plan = data.plan;
  const resolved = Boolean(data.resolutionReason || data.resolvedByOther);
  const readOnly = Boolean(submittingDecision) || resolved;
  const ready = Boolean(plan.id);

  useEffect(() => {
    setReason("");
    setSubmittingDecision(null);
  }, [data.awaitingId, data.runId]);

  useResolvedByOtherNotice({
    resolvedByOther: data.resolvedByOther,
    resolutionReason: data.resolutionReason,
    onResolvedByOther,
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
    <Flex vertical ref={hostRef} className={Style.QuestionWrapper}>
      <Flex className={Style.Question} align="baseline">
        <Flex vertical gap={4} className={Style.QuestionText}>
          <span className={Style.QuestionHeading}>
            {plan.title || t("planDialog.titleFallback")}
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
            <span className={Style.Info}>{t("planDialog.option.approve")}</span>
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
              style={{ padding: 0, fontSize: 12, borderRadius: 0 }}
            />
            <Button
              type="link"
              shape="round"
              className={Style.IgnoreButton}
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
