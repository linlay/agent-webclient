import {
  AIAwaitQuestionType,
  type AIAwaitQuestion,
} from "@/app/state/types";
import {
  buildQuestionSubmitParams,
  clampAwaitingIndex,
  createAwaitingParamPlaceholders,
  getAwaitingAnswerError,
  getAwaitingQuestionHeading,
  getAwaitingQuestionPlaceholder,
  getAwaitingQuestionPrompt,
  getSelectFreeTextAnswer,
  getSelectGroupValue,
  hasAwaitingQuestions,
  isEditableKeyboardTarget,
} from "@/features/tools/components/buildin/confirm-dialog/state";

function createQuestion(question: string): AIAwaitQuestion {
  return {
    type: AIAwaitQuestionType.Select,
    question,
    options: [
      {
        label: "继续",
      },
    ],
  };
}

describe("confirm dialog state helpers", () => {
  it("treats empty questions as loading instead of ready", () => {
    expect(hasAwaitingQuestions([])).toBe(false);
    expect(hasAwaitingQuestions(undefined)).toBe(false);
    expect(hasAwaitingQuestions([createQuestion("继续执行吗？")])).toBe(true);
  });

  it("rebuilds form placeholders from the current question count", () => {
    expect(createAwaitingParamPlaceholders([])).toEqual([]);
    expect(
      createAwaitingParamPlaceholders([
        createQuestion("问题 1"),
        createQuestion("问题 2"),
      ]),
    ).toEqual([{}, {}]);
  });

  it("clamps the active index when payload questions arrive later", () => {
    expect(clampAwaitingIndex(3, 0)).toBe(0);
    expect(clampAwaitingIndex(3, 2)).toBe(1);
    expect(clampAwaitingIndex(1, 2)).toBe(1);
  });

  it("prefers question as heading and downgrades header to prompt", () => {
    const question: AIAwaitQuestion = {
      type: AIAwaitQuestionType.Password,
      header: "数据库密码",
      question: "请输入数据库密码",
      placeholder: "sk-...",
    };

    expect(getAwaitingQuestionHeading(question)).toBe("请输入数据库密码");
    expect(getAwaitingQuestionPrompt(question)).toBe("数据库密码");
    expect(getAwaitingQuestionPlaceholder(question)).toBe("sk-...");
  });

  it("validates text, number and password answers", () => {
    expect(
      getAwaitingAnswerError(
        {
          type: AIAwaitQuestionType.Text,
          question: "姓名",
        },
        { question: "姓名", answer: "" },
      ),
    ).toBe("请输入内容");

    expect(
      getAwaitingAnswerError(
        {
          type: AIAwaitQuestionType.Number,
          question: "端口",
        },
        { question: "端口", answer: 8080 },
      ),
    ).toBeNull();

    expect(
      getAwaitingAnswerError(
        {
          type: AIAwaitQuestionType.Password,
          question: "密码",
        },
        { question: "密码", answer: "secret" },
      ),
    ).toBeNull();
  });

  it("tracks select free text separately from option values", () => {
    const question: AIAwaitQuestion = {
      type: AIAwaitQuestionType.MultiSelect,
      question: "环境",
      allowFreeText: true,
      options: [
        { label: "dev" },
        { label: "prod" },
      ],
    };

    expect(
      getSelectGroupValue(question, {
        question: "环境",
        answers: ["dev", "custom-env"],
      }),
    ).toEqual(["dev", "freeText"]);
    expect(
      getSelectFreeTextAnswer(question, {
        question: "环境",
        answers: ["dev", "custom-env"],
      }),
    ).toBe("custom-env");
  });

  it("detects editable targets so keyboard shortcuts do not hijack input fields", () => {
    expect(
      isEditableKeyboardTarget({
        tagName: "INPUT",
        isContentEditable: false,
      } as HTMLElement),
    ).toBe(true);
    expect(
      isEditableKeyboardTarget({
        tagName: "DIV",
        isContentEditable: false,
      } as HTMLElement),
    ).toBe(false);
  });

  it("builds partial question submit params for timeout auto-submit", () => {
    const questions: AIAwaitQuestion[] = [
      {
        id: "name",
        type: AIAwaitQuestionType.Text,
        question: "姓名",
      },
      {
        id: "env",
        type: AIAwaitQuestionType.MultiSelect,
        question: "环境",
        options: [{ label: "dev" }, { label: "prod" }],
      },
      {
        id: "port",
        type: AIAwaitQuestionType.Number,
        question: "端口",
      },
    ];

    expect(buildQuestionSubmitParams(questions, [
      {
        id: "name",
        answer: "  Alice  ",
      },
      {
        id: "env",
        answers: ["dev", " ", "custom"],
      },
      {
        id: "port",
      } as any,
    ])).toEqual([
      {
        id: "name",
        answer: "Alice",
      },
      {
        id: "env",
        answers: ["dev", "custom"],
      },
      {
        id: "port",
      },
    ]);
  });
});
