import {
  Button,
  Checkbox,
  CheckboxRef,
  DatePicker,
  Flex,
  Form,
  Input,
  InputNumber,
  Tabs,
  Tooltip,
} from "antd/es";
import { message } from "antd";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import dayjs from "dayjs";
import {
  AIAwaitQuestion,
  AIAwaitQuestionType,
  AIAwaitQuestionSubmitParamData,
  AIAwaitSubmitPayloadData,
  QuestionActiveAwaiting,
} from "@/app/state/types";
import { useKeyboard } from "@/shared/utils/useKeyboard";
import {
  EnterOutlined,
  InfoCircleOutlined,
  LeftOutlined,
  LoadingOutlined,
  RightOutlined,
} from "@ant-design/icons";
import Style from "@/features/tools/components/buildin/confirm-dialog/index.module.css";
import {
  buildQuestionSubmitParams,
  clampAwaitingIndex,
  createAwaitingParamPlaceholders,
  findAwaitingAnswerError,
  getAwaitingDateFormat,
  getAwaitingQuestionHeading,
  getAwaitingQuestionPlaceholder,
  getAwaitingQuestionPrompt,
  getSelectFreeTextAnswer,
  getSelectGroupValue,
  getSelectOptionTooltip,
  getSelectedOptionAnswers,
  getSelectOptions,
  getSelectOptionValue,
  hasAwaitingQuestions,
  isValidAwaitingDateAnswer,
  isMultiSelectQuestionType,
  isSelectQuestionType,
  isEditableKeyboardTarget,
} from "@/features/tools/components/buildin/confirm-dialog/state";
import { useAwaitingTimeoutCountdown } from "@/features/tools/components/awaitingTimeout";
import { debounce } from "lodash";
import { useI18n } from "@/shared/i18n";

const FREE_TEXT_OPTION_VALUE = "freeText";

interface ConfirmDialogProps extends CallbackData {
  data: QuestionActiveAwaiting;
  onResolvedByOther?: () => void;
}

interface CallbackData {
  onSubmit?: (paylod: AIAwaitSubmitPayloadData) => Promise<any>;
}

export const QuestionDialog: React.FC<ConfirmDialogProps> = ({
  data,
  onSubmit,
  onResolvedByOther,
}) => {
  const { t } = useI18n();
  const [form] = Form.useForm<AIAwaitSubmitPayloadData>();
  const callbackRef = useRef<CallbackData>({});
  const questionsRef = useRef<QuestionRef[]>([]);
  const resolvedByOtherHandledRef = useRef(false);
  const total = useRef(0);
  const [loading, setLoading] = useState(false);
  const [timeoutExpired, setTimeoutExpired] = useState(false);
  const [curIndex, setCurIndex] = useState(0);
  const questions = useMemo(() => data?.questions || [], [data]);
  const currentQuestion = questions[curIndex];
  const ready = useMemo(() => hasAwaitingQuestions(questions), [questions]);

  const submitPayload = useCallback((payload: AIAwaitSubmitPayloadData) => {
    setLoading(true);
    const pending = callbackRef.current?.onSubmit?.(payload);
    if (!pending) {
      setLoading(false);
      return Promise.resolve(undefined);
    }
    return pending.finally(() => setLoading(false));
  }, []);

  const doSubmit = useCallback(() => {
    const params = form.getFieldValue("params") as
      | AIAwaitQuestionSubmitParamData[]
      | undefined;
    const error = findAwaitingAnswerError(questions, params);
    if (error) {
      setCurIndex(error.index);
      void message.warning(error.message);
      return;
    }

    void submitPayload({
      runId: data?.runId || "",
      awaitingId: data?.awaitingId || "",
      params: buildQuestionSubmitParams(questions, params),
    });
  }, [data?.awaitingId, data?.runId, form, questions, submitPayload]);

  const doSkip = useCallback(() => {
    const params = (form.getFieldValue("params") ||
      []) as AIAwaitQuestionSubmitParamData[];
    const current = questions[curIndex];
    if (!current) {
      return;
    }

    const nextParams = [...params];
    nextParams[curIndex] = {
      id: current.id,
      answer: "reject",
    };
    form.setFieldsValue({
      params: nextParams,
    });

    if (questions.length > curIndex + 1) {
      setCurIndex((prev) => Math.min(questions.length - 1, prev + 1));
      return;
    }

    void submitPayload({
      runId: data?.runId || "",
      awaitingId: data?.awaitingId || "",
      params: buildQuestionSubmitParams(questions, nextParams),
    });
  }, [curIndex, data?.awaitingId, data?.runId, questions, submitPayload]);

  const moveForward = useCallback(() => {
    if (questions.length === 0) {
      return;
    }

    const params = form.getFieldValue("params") as
      | AIAwaitQuestionSubmitParamData[]
      | undefined;
    const error = findAwaitingAnswerError(
      [questions[curIndex]],
      params ? [params[curIndex]] : undefined,
    );
    if (error) {
      void message.warning(error.message);
      return;
    }

    if (curIndex >= questions.length - 1) {
      doSubmit();
      return;
    }
    setCurIndex((prev) => Math.min(questions.length - 1, prev + 1));
  }, [curIndex, doSubmit, form, questions]);

  useKeyboard({
    enabled: currentQuestion ? isSelectQuestionType(currentQuestion) : false,
    getAllHost: () => questionsRef.current[curIndex]?.getElements(),
    onEnter: (element) => {
      if (element.dataset.multiSelect === "true") {
        moveForward();
        return;
      }
      const i = Number(element.dataset.index);
      const questionRef = questionsRef.current[curIndex];
      questionRef?.check(i);
    },
    onKeyDown: (e) => {
      if (isEditableKeyboardTarget(e.target)) {
        return;
      }
      const activeElement = document.activeElement as HTMLElement | null;
      const isCurrentMultiSelect = currentQuestion
        ? isMultiSelectQuestionType(currentQuestion)
        : false;
      const isSpaceKey = e.key === " " || e.code === "Space";
      if (
        isSpaceKey &&
        isCurrentMultiSelect &&
        activeElement?.dataset.multiSelect === "true"
      ) {
        e.preventDefault();
        e.stopPropagation();
        const i = Number(activeElement.dataset.index);
        const questionRef = questionsRef.current[curIndex];
        questionRef?.check(i);
        return;
      }
      if (e.key === "Enter" && isCurrentMultiSelect) {
        e.preventDefault();
        e.stopPropagation();
        moveForward();
        return;
      }
      if (!/^[1-9]$/.test(e.key)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const i = Number(e.key) - 1;
      const questionRef = questionsRef.current[curIndex];
      questionRef?.check(i);
    },
  });

  useEffect(() => {
    callbackRef.current = {
      onSubmit,
    };
  }, [onSubmit]);

  useEffect(() => {
    if (!data?.resolvedByOther) {
      resolvedByOtherHandledRef.current = false;
      return;
    }
    if (resolvedByOtherHandledRef.current) {
      return;
    }
    resolvedByOtherHandledRef.current = true;
    void message.info(t("approvalDialog.resolvedByOther"));
    onResolvedByOther?.();
  }, [data?.resolvedByOther, onResolvedByOther, t]);

  useEffect(() => {
    total.current = questions.length;
    form.setFieldsValue({
      runId: data?.runId || "",
      awaitingId: data?.awaitingId || "",
      params: createAwaitingParamPlaceholders(questions) as any,
    });
    setCurIndex((prev) => clampAwaitingIndex(prev, questions.length));
    setTimeoutExpired(false);
  }, [data?.awaitingId, data?.runId, form, questions]);

  const handleAutoSubmit = useCallback(() => {
    if (loading || data?.resolvedByOther) {
      return;
    }
    setTimeoutExpired(true);
    void submitPayload({
      runId: data?.runId || "",
      awaitingId: data?.awaitingId || "",
      params: buildQuestionSubmitParams(
        questions,
        form.getFieldValue("params") as
          | AIAwaitQuestionSubmitParamData[]
          | undefined,
      ),
    });
  }, [
    data?.awaitingId,
    data?.resolvedByOther,
    data?.runId,
    form,
    loading,
    questions,
    submitPayload,
  ]);

  const timeoutCountdown = useAwaitingTimeoutCountdown({
    awaitingKey: data.key,
    timeout: data.timeout,
    createdAt: data.createdAt,
    onExpire: handleAutoSubmit,
  });

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isEditableKeyboardTarget(e.target)) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          doSkip();
        }
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        setCurIndex((prev) => Math.min(total.current - 1, prev + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        setCurIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        doSkip();
      }
    },
    [doSkip],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return ready ? (
    <Form
      form={form}
      className={Style.ConfirmDialog}
      disabled={loading}
      onFinish={doSubmit}
    >
      <Form.Item name="runId" hidden />
      <Form.Item name="awaitingId" hidden />
      <Form.List name="params">
        {(fields) => {
          return (
            <Tabs
              activeKey={curIndex.toString()}
              onChange={(key) => setCurIndex(Number(key))}
              renderTabBar={() => null as any}
              items={fields.map((field) => ({
                key: field.key.toString(),
                label: field.name,
                children: (
                  <Form.Item {...field} className={Style.FormItem}>
                    <Question
                      ref={(ref) => {
                        if (ref) {
                          questionsRef.current[field.name] = ref;
                        }
                      }}
                      data={questions[field.name]}
                      onEnter={() => {
                        void moveForward();
                      }}
                      pagnation={
                        <Flex
                          className={Style.HeaderSide}
                          align="center"
                          gap={12}
                        >
                          {questions.length > 1 && (
                            <Flex
                              className={Style.Pagination}
                              align="center"
                              gap={10}
                            >
                              <Button
                                disabled={curIndex <= 0}
                                icon={<LeftOutlined style={{ fontSize: 12 }} />}
                                size="small"
                                type="text"
                                onClick={() => setCurIndex(curIndex - 1)}
                              />
                              <span>
                                {curIndex + 1} / {questions.length}
                              </span>
                              <Button
                                size="small"
                                type="text"
                                disabled={curIndex >= questions.length - 1}
                                icon={
                                  <RightOutlined style={{ fontSize: 12 }} />
                                }
                                onClick={() => setCurIndex(curIndex + 1)}
                              />
                            </Flex>
                          )}
                        </Flex>
                      }
                    />
                  </Form.Item>
                ),
              }))}
            />
          );
        }}
      </Form.List>
      <Flex gap={10} align="center" justify="space-between">
        {timeoutCountdown.label && (
          <Flex className={Style.TimeoutRow}>
            {timeoutExpired && loading
              ? t("approvalDialog.status.autoSubmitting")
              : t("approvalDialog.timeout.countdown", {
                  label: timeoutCountdown.label,
                })}
          </Flex>
        )}
        <Flex gap={10}>
          <Button
            type="link"
            shape="round"
            className={Style.SkipButton}
            size="small"
            onClick={doSkip}
          >
            <span>{t("confirmDialog.action.skip")}</span>
          </Button>
          {curIndex < questions.length - 1 && (
            <Button
              type="primary"
              shape="round"
              size="small"
              onClick={() => {
                void moveForward();
              }}
            >
              {t("approvalDialog.action.continue")}
            </Button>
          )}
          {curIndex >= questions.length - 1 && (
            <Button
              type="primary"
              shape="round"
              size="small"
              loading={loading}
              onClick={() => {
                void doSubmit();
              }}
            >
              <span>{t("approvalDialog.action.submit")}</span>
              <EnterOutlined />
            </Button>
          )}
        </Flex>
      </Flex>
    </Form>
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
      <div>{t("confirmDialog.loading")}</div>
    </Flex>
  );
};

export const ConfirmDialog = QuestionDialog;

function SelectOptionTooltipTitle({
  option,
}: {
  option: NonNullable<AIAwaitQuestion["options"]>[number];
}) {
  const tooltip = getSelectOptionTooltip(option);
  if (!tooltip) {
    return null;
  }

  if (tooltip.kind === "preview") {
    return (
      <div className={Style.OptionPreview}>
        <iframe
          title={`${option.label} preview`}
          className={Style.OptionPreviewFrame}
          srcDoc={tooltip.html}
          sandbox=""
        />
      </div>
    );
  }

  return <>{tooltip.text}</>;
}

interface QuestionRef {
  check: (i: number) => void;
  getElements: () => NodeListOf<HTMLElement> | undefined;
}

const Question = forwardRef<
  QuestionRef,
  {
    data: AIAwaitQuestion;
    onEnter: () => void;
    pagnation: React.ReactNode;
    value?: AIAwaitQuestionSubmitParamData;
    onChange?: (value: AIAwaitQuestionSubmitParamData) => void;
  }
>(({ data, value, onChange, onEnter, pagnation }, ref) => {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const checkboxsRef = useRef<CheckboxRef[]>([]);
  const heading = getAwaitingQuestionHeading(data);
  const prompt = getAwaitingQuestionPrompt(data);
  const placeholder = getAwaitingQuestionPlaceholder(data);
  const options = getSelectOptions(data);
  const freeTextAnswer = getSelectFreeTextAnswer(data, value);
  const selectedOptionAnswers = getSelectedOptionAnswers(data, value);
  const onEnterDebounce = useCallback(debounce(onEnter, 150), [onEnter]);

  useImperativeHandle(
    ref,
    () => ({
      getElements: () => {
        return hostRef.current?.querySelectorAll('[tabIndex="0"]');
      },
      // 单选方法
      check: (i: number) => {
        const checkboxRef = checkboxsRef.current?.[i];
        if (checkboxRef) {
          checkboxRef.input?.click();
          if (!isMultiSelectQuestionType(data)) {
            onEnterDebounce();
          }
        }
      },
    }),
    [data, onEnterDebounce],
  );

  const setAnswer = useCallback(
    (next: Partial<AIAwaitQuestionSubmitParamData>) => {
      onChange?.({
        id: data.id,
        ...next,
      });
    },
    [data.id, onChange],
  );

  const renderQuestionHeader = () => {
    return (
      <Flex className={Style.Question} justify="space-between" align="baseline">
        <Flex vertical>
          <div className={Style.QuestionHeading}>{heading}</div>
          {prompt && <div className={Style.QuestionPrompt}>{prompt}</div>}
        </Flex>
        {pagnation}
      </Flex>
    );
  };

  if (data.type === AIAwaitQuestionType.Text) {
    return (
      <Flex vertical ref={hostRef} className={Style.QuestionWrapper}>
        {renderQuestionHeader()}
        <Input
          className={Style.InputField}
          ref={(ref) => ref?.focus()}
          tabIndex={0}
          placeholder={placeholder}
          value={typeof value?.answer === "string" ? value.answer : ""}
          onChange={(e) => setAnswer({ answer: e.target.value })}
          onPressEnter={(e) => {
            e.preventDefault();
            if (e.currentTarget.value.trim()) {
              onEnter();
            }
          }}
        />
      </Flex>
    );
  }

  if (data.type === AIAwaitQuestionType.Password) {
    return (
      <Flex vertical ref={hostRef} className={Style.QuestionWrapper}>
        {renderQuestionHeader()}
        <Input.Password
          ref={(ref) => ref?.focus()}
          className={Style.InputField}
          tabIndex={0}
          placeholder={placeholder}
          value={typeof value?.answer === "string" ? value.answer : ""}
          onChange={(e) => setAnswer({ answer: e.target.value })}
          onPressEnter={(e) => {
            e.preventDefault();
            if (e.currentTarget.value.trim()) {
              onEnter();
            }
          }}
        />
      </Flex>
    );
  }

  if (data.type === AIAwaitQuestionType.Number) {
    return (
      <Flex vertical ref={hostRef} className={Style.QuestionWrapper}>
        {renderQuestionHeader()}
        <InputNumber
          ref={(ref) => ref?.focus()}
          className={Style.InputField}
          style={{ width: "100%" }}
          tabIndex={0}
          controls={false}
          placeholder={placeholder}
          value={typeof value?.answer === "number" ? value.answer : null}
          onChange={(nextValue) => {
            setAnswer({
              answer:
                typeof nextValue === "number" && Number.isFinite(nextValue)
                  ? nextValue
                  : undefined,
            });
          }}
          onKeyDown={(e) => {
            const nextValue =
              typeof value?.answer === "number" && Number.isFinite(value.answer)
                ? value.answer
                : null;
            if (e.key === "Enter" && nextValue !== null) {
              e.preventDefault();
              onEnterDebounce();
            }
          }}
        />
      </Flex>
    );
  }

  if (
    data.type === AIAwaitQuestionType.Date ||
    data.type === AIAwaitQuestionType.DateTime
  ) {
    const format = getAwaitingDateFormat(data);
    const answer =
      typeof value?.answer === "string" &&
      isValidAwaitingDateAnswer(data, value.answer)
        ? value.answer
        : "";
    return (
      <Flex vertical ref={hostRef} className={Style.QuestionWrapper}>
        {renderQuestionHeader()}
        <DatePicker
          ref={(ref) => ref?.focus()}
          className={Style.InputField}
          style={{ width: "auto" }}
          tabIndex={0}
          placeholder={placeholder || format}
          format={format}
          showTime={
            data.type === AIAwaitQuestionType.DateTime
              ? { format: "HH:mm:ss" }
              : false
          }
          value={answer ? dayjs(answer) : null}
          onChange={(nextValue) => {
            setAnswer({
              answer: nextValue ? nextValue.format(format) : undefined,
            });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && answer) {
              e.preventDefault();
              onEnterDebounce();
            }
          }}
        />
      </Flex>
    );
  }

  return (
    <Flex vertical ref={hostRef} className={Style.QuestionWrapper}>
      {renderQuestionHeader()}
      <Checkbox.Group
        className={Style.CheckboxGroup}
        value={getSelectGroupValue(data, value)}
        onChange={(keys) => {
          const optionKeys = keys.filter(
            (item) => item !== FREE_TEXT_OPTION_VALUE,
          );
          if (isMultiSelectQuestionType(data)) {
            const nextAnswers = freeTextAnswer
              ? [...optionKeys, freeTextAnswer]
              : optionKeys;
            setAnswer({ answers: nextAnswers });
            return;
          }

          const last = optionKeys.at(-1);
          setAnswer({ answer: last });
          if (last) {
            onEnterDebounce();
          }
        }}
      >
        {options.map((option, i) => {
          const optionValue = getSelectOptionValue(option);
          const tooltip = getSelectOptionTooltip(option);
          return (
            <Checkbox
              key={optionValue}
              ref={(checkboxRef) => {
                if (checkboxRef) {
                  checkboxsRef.current[i] = checkboxRef;
                }
              }}
              value={optionValue}
              className={Style.Option}
            >
              <Flex
                gap={10}
                align="center"
                tabIndex={0}
                data-index={i}
                data-multi-select={isMultiSelectQuestionType(data)}
                style={{ outline: "none" }}
              >
                <span>{i + 1}.</span>
                <span className={Style.Info}>{option.label}</span>
                {tooltip && (
                  <Tooltip
                    title={<SelectOptionTooltipTitle option={option} />}
                    styles={{
                      body:
                        tooltip.kind === "preview" ? { padding: 0 } : undefined,
                    }}
                  >
                    <InfoCircleOutlined />
                  </Tooltip>
                )}
                <span className="Selected">{t("approvalDialog.selected")}</span>
              </Flex>
            </Checkbox>
          );
        })}
      </Checkbox.Group>
      {data.allowFreeText && (
        <Flex className={[Style.Option, Style.FreeText].join(" ")} gap={10}>
          <span>{options.length + 1}.</span>
          <Input
            variant="borderless"
            placeholder={placeholder}
            value={freeTextAnswer}
            tabIndex={0}
            onChange={(e) => {
              const nextValue = e.target.value;
              if (isMultiSelectQuestionType(data)) {
                setAnswer({
                  answers: nextValue
                    ? [...selectedOptionAnswers, nextValue]
                    : selectedOptionAnswers,
                });
                return;
              }
              setAnswer({ answer: nextValue });
            }}
            onPressEnter={(e) => {
              if (e.currentTarget.value.trim()) {
                onEnter();
              }
            }}
            style={{ padding: 0 }}
          />
        </Flex>
      )}
    </Flex>
  );
});
