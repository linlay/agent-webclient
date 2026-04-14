import {
  Button,
  Checkbox,
  CheckboxRef,
  Empty,
  Flex,
  Form,
  Spin,
  Tabs,
  Tooltip,
} from "antd/es";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActiveAwaiting,
  AIAwaitQuestion,
  AIAwaitSubmitParamData,
  AIAwaitSubmitPayloadData,
} from "@/context/types";
import { useKeyboard } from "@/hooks/useKeyboard";
import {
  EnterOutlined,
  InfoCircleOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import Style from "./index.module.css";

interface ConfirmDialogProps extends CallbackData {
  data: ActiveAwaiting;
}
interface CallbackData {
  onSubmit?: (paylod: AIAwaitSubmitPayloadData) => Promise<any>;
}
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  data,
  onSubmit,
}) => {
  const [form] = Form.useForm<AIAwaitSubmitPayloadData>();
  const callbackRef = useRef<CallbackData>({});
  const total = useRef(0);
  const [loading, setLoading] = useState(false);
  const [curIndex, setCurIndex] = useState(0);
  const questions = useMemo(() => data?.questions || [], [data]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
  useEffect(() => {
    callbackRef.current = {
      onSubmit,
    };
  }, [onSubmit]);
  useEffect(() => {
    total.current = questions.length;
    form.setFieldsValue({
      runId: data?.runId || "",
      awaitingId: data?.awaitingId || "",
      params: Array.from(
        { length: data?.questions?.length },
        () => ({}),
      ) as any,
    });
  }, [data]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
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
  }, []);

  const onEnter = () => {
    if (curIndex >= questions.length - 1) {
      form.submit();
    } else {
      setCurIndex(curIndex + 1);
    }
  };
  const doSubmit = (payload: AIAwaitSubmitPayloadData) => {
    setLoading(true);
    callbackRef.current?.onSubmit?.(payload).finally(() => setLoading(false));
  };
  const doIgnore = () => {
    callbackRef.current?.onSubmit?.({
      runId: data?.runId || "",
      awaitingId: data?.awaitingId || "",
      params: questions.map((item) => ({
        question: item.question,
      })),
    });
  };
  return (
    <Form
      form={form}
      className={Style.ConfirmDialog}
      disabled={loading}
      onFinish={doSubmit}
    >
      {questions?.length > 1 && (
        <Flex className={Style.Pagination} align="center">
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
      )}
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
                destroyInactiveTabPane: true,
                children: (
                  <Form.Item
                    {...field}
                    className={Style.FormItem}
                    // rules={[
                    //   {
                    //     message: "请选择选项",
                    //     validator: (_, val, callback) => {
                    //       const answer = val?.answer || [];
                    //       if (answer.length === 0 && !val?.freeText) {
                    //         callback("请选择");
                    //         setCurIndex(field.name);
                    //       } else {
                    //         callback();
                    //       }
                    //     },
                    //   },
                    // ]}
                  >
                    <Question
                      data={questions?.[field.name]}
                      onEnter={onEnter}
                    />
                  </Form.Item>
                ),
              }))}
            />
          );
        }}
      </Form.List>
      {!questions?.length && (
        <Spin tip="问题生成中...">
          <div style={{ padding: 50 }}></div>
        </Spin>
      )}
      <Flex gap={10} justify="flex-end" align="center">
        <Button
          type="text"
          shape="round"
          className={Style.IgnoreButton}
          onClick={doIgnore}
        >
          <span>忽略</span>
          <span>ESC</span>
        </Button>
        {curIndex < questions.length - 1 ? (
          <Button
            type="primary"
            shape="round"
            onClick={() => setCurIndex(curIndex + 1)}
          >
            继续
          </Button>
        ) : (
          <Button
            type="primary"
            shape="round"
            htmlType="submit"
            loading={loading}
          >
            <span>提交</span>
            <EnterOutlined />
          </Button>
        )}
      </Flex>
    </Form>
  );
};

const Question: React.FC<{
  data: AIAwaitQuestion;
  onEnter: () => void;
  value?: AIAwaitSubmitParamData;
  onChange?: (value: AIAwaitSubmitParamData) => void;
}> = ({ data, value, onChange, onEnter }) => {
  const { options } = data;
  const hostRef = useRef<HTMLElement>(null);
  const checkboxsRef = useRef<CheckboxRef[]>([]);

  useKeyboard({
    getAllHost: () => hostRef.current?.querySelectorAll('[tabIndex="0"]'),
    onEnter: (element) => {
      const i = Number(element.dataset.index);
      checkboxsRef.current[i]?.input?.click();
      onEnter();
    },
    onKeyDown: (e) => {
      if (!/^[1-9]$/.test(e.key)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const i = Number(e.key) - 1;
      const ref = checkboxsRef.current[i];
      if (ref) {
        ref?.input?.click();
        onEnter();
      }
    },
  });
  useEffect(() => {
    const answer = value?.answer?.[0];
    let i = 0;
    const refs =
      hostRef.current?.querySelectorAll<HTMLElement>('[tabIndex="0"]');
    if (answer) {
      i = Math.max(
        0,
        options.findIndex(
          (option) => option.value === answer || option.label === answer,
        ),
      );
    }
    if (refs) {
      refs.item(i)?.focus();
    }
  }, [value]);
  return options?.length > 0 ? (
    <Flex vertical ref={hostRef} className={Style.QuestionWrapper}>
      <div className={Style.Question}>{data.question}</div>
      <Checkbox.Group
        className={Style.CheckboxGroup}
        value={value?.answer}
        onChange={(keys) => {
          const answer = keys.at(-1);
          onChange?.({
            question: data.question,
            answer: answer ? [answer] : [],
          });
          onEnter();
        }}
      >
        {options.map((option, i) => (
          <Checkbox
            key={option.value ?? option.label}
            ref={(ref) => ref && (checkboxsRef.current[i] = ref)}
            value={option.value ?? option.label}
            className={Style.Option}
          >
            <Flex
              gap={10}
              align="center"
              tabIndex={0}
              data-index={i}
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
        ))}
      </Checkbox.Group>
    </Flex>
  ) : (
    <Empty description={data.question} />
  );
};
