import {
  Button,
  Checkbox,
  CheckboxRef,
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
  clampAwaitingIndex,
  createAwaitingParamPlaceholders,
  getAwaitingAnswerError,
  getAwaitingQuestionHeading,
  getAwaitingQuestionPlaceholder,
  getAwaitingQuestionPrompt,
  getSelectFreeTextAnswer,
  getSelectGroupValue,
  getSelectedOptionAnswers,
  getSelectOptions,
  getSelectOptionValue,
  hasAwaitingQuestions,
  isMultiSelectQuestionType,
  isSelectQuestionType,
  isEditableKeyboardTarget,
} from "@/features/tools/components/buildin/confirm-dialog/state";
import { debounce } from "lodash";

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
  const [form] = Form.useForm<AIAwaitSubmitPayloadData>();
  const callbackRef = useRef<CallbackData>({});
  const questionsRef = useRef<QuestionRef[]>([]);
  const resolvedByOtherHandledRef = useRef(false);
  const total = useRef(0);
  const [loading, setLoading] = useState(false);
  const [curIndex, setCurIndex] = useState(0);
  const questions = useMemo(() => data?.questions || [], [data]);
  const currentQuestion = questions[curIndex];
  const ready = useMemo(() => hasAwaitingQuestions(questions), [questions]);

  const doSubmit = useCallback((payload: AIAwaitSubmitPayloadData) => {
    setLoading(true);
    const pending = callbackRef.current?.onSubmit?.(payload);
    pending?.finally(() => setLoading(false));
  }, []);

  const doIgnore = useCallback(() => {
    callbackRef.current?.onSubmit?.({
      runId: data?.runId || "",
      awaitingId: data?.awaitingId || "",
      params: questions.map((item) => ({
        id: item.id,
      })),
    });
  }, [data?.awaitingId, data?.runId, questions]);

  const moveForward = useCallback(async () => {
    if (questions.length === 0) {
      return;
    }

    try {
      await form.validateFields([["params", curIndex]]);
      if (curIndex >= questions.length - 1) {
        form.submit();
        return;
      }
      setCurIndex((prev) => Math.min(questions.length - 1, prev + 1));
    } catch {
      // Form validation already renders the inline error.
    }
  }, [curIndex, form, questions.length]);

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
    setTimeout(() => {
      const questionRef = questionsRef.current[curIndex];
      questionRef?.getElements()?.[0]?.focus();
    }, 300);
  }, [curIndex]);
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
    void message.info("已被其他终端提交");
    onResolvedByOther?.();
  }, [data?.resolvedByOther, onResolvedByOther]);

  useEffect(() => {
    total.current = questions.length;
    form.setFieldsValue({
      runId: data?.runId || "",
      awaitingId: data?.awaitingId || "",
      params: createAwaitingParamPlaceholders(questions) as any,
    });
    setCurIndex((prev) => clampAwaitingIndex(prev, questions.length));
  }, [data?.awaitingId, data?.runId, form, questions]);

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
        setCurIndex((prev) => Math.min(total.current - 1, prev + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        setCurIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        doIgnore();
      }
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
                  <Form.Item
                    {...field}
                    className={Style.FormItem}
                    rules={[
                      {
                        validator: async (
                          _,
                          value: AIAwaitQuestionSubmitParamData,
                        ) => {
                          const error = getAwaitingAnswerError(
                            questions[field.name],
                            value,
                          );
                          if (error) {
                            throw new Error(error);
                          }
                        },
                      },
                    ]}
                  >
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
                        questions.length > 1 && (
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
                              icon={<RightOutlined style={{ fontSize: 12 }} />}
                              onClick={() => setCurIndex(curIndex + 1)}
                            />
                          </Flex>
                        )
                      }
                    />
                  </Form.Item>
                ),
              }))}
            />
          );
        }}
      </Form.List>
      <Flex gap={10} justify="flex-end" align="center">
        <Button
          type="link"
          shape="round"
          className={Style.IgnoreButton}
          size="small"
          onClick={doIgnore}
        >
          <span>忽略</span>
          <span>ESC</span>
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
            继续
          </Button>
        )}
        {curIndex >= questions.length - 1 && (
          <Button
            type="primary"
            shape="round"
            htmlType="submit"
            size="small"
            loading={loading}
          >
            <span>提交</span>
            <EnterOutlined />
          </Button>
        )}
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
      <div>问题生成中...</div>
    </Flex>
  );
};

export const ConfirmDialog = QuestionDialog;

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
  const hostRef = useRef<HTMLDivElement>(null);
  const checkboxsRef = useRef<CheckboxRef[]>([]);
  const heading = getAwaitingQuestionHeading(data);
  const prompt = getAwaitingQuestionPrompt(data);
  const placeholder = getAwaitingQuestionPlaceholder(data);
  const options = getSelectOptions(data);
  const freeTextAnswer = getSelectFreeTextAnswer(data, value);
  const selectedOptionAnswers = getSelectedOptionAnswers(data, value);
  const onEnterDebounce = useCallback(debounce(onEnter, 500), [onEnter]);

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
      <Flex className={Style.Question} align="baseline">
        <Flex vertical gap={4} className={Style.QuestionText}>
          <span className={Style.QuestionHeading}>{heading}</span>
          {prompt && <span className={Style.QuestionPrompt}>{prompt}</span>}
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
          tabIndex={0}
          placeholder={placeholder}
          value={typeof value?.answer === "string" ? value.answer : ""}
          onChange={(e) => setAnswer({ answer: e.target.value })}
          onPressEnter={(e) => {
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
          className={Style.InputField}
          tabIndex={0}
          placeholder={placeholder}
          value={typeof value?.answer === "string" ? value.answer : ""}
          onChange={(e) => setAnswer({ answer: e.target.value })}
          onPressEnter={(e) => {
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
                <span>{i + 1}。</span>
                <span className={Style.Info}>{option.label}</span>
                {option.description && (
                  <Tooltip title={option.description}>
                    <InfoCircleOutlined />
                  </Tooltip>
                )}
                <span className="Selected">已选</span>
              </Flex>
            </Checkbox>
          );
        })}
      </Checkbox.Group>
      {data.allowFreeText && (
        <Flex className={[Style.Option, Style.FreeText].join(" ")} gap={10}>
          <span>{options.length + 1}。</span>
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
