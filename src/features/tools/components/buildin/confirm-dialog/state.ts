import {
  AIAwaitQuestionType,
  type AIAwaitQuestion,
  type AIAwaitQuestionOption,
  type AIAwaitQuestionSubmitParamData,
} from "@/app/state/types";

export function hasAwaitingQuestions(
  questions: AIAwaitQuestion[] | null | undefined,
): boolean {
  return Array.isArray(questions) && questions.length > 0;
}

export function createAwaitingParamPlaceholders(
  questions: AIAwaitQuestion[] | null | undefined,
): Record<string, never>[] {
  const total = Array.isArray(questions) ? questions.length : 0;
  return Array.from({ length: total }, () => ({}));
}

export function clampAwaitingIndex(index: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  if (index <= 0) {
    return 0;
  }
  if (index >= total) {
    return total - 1;
  }
  return index;
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  const tagName = element.tagName;
  return (
    tagName === "INPUT" || tagName === "TEXTAREA" || element.isContentEditable
  );
}

export function getAwaitingQuestionHeading(question: AIAwaitQuestion): string {
  return question?.question?.trim() || question?.header?.trim() || "";
}

export function getAwaitingQuestionPrompt(question: AIAwaitQuestion): string {
  const heading = getAwaitingQuestionHeading(question);
  const header = question.header?.trim() || "";
  const prompt = header || question.question;
  if (!prompt || heading === prompt) {
    return "";
  }
  return prompt;
}

export function getAwaitingQuestionPlaceholder(
  question: AIAwaitQuestion,
): string {
  if (isSelectQuestionType(question)) {
    return question.freeTextPlaceholder || "";
  }
  return question.placeholder || "";
}

export function isSelectQuestionType(question: AIAwaitQuestion): boolean {
  return (
    question.type === AIAwaitQuestionType.Select
    || question.type === AIAwaitQuestionType.MultiSelect
  );
}

export function isMultiSelectQuestionType(question: AIAwaitQuestion): boolean {
  return question.type === AIAwaitQuestionType.MultiSelect;
}

export function getAwaitingDateFormat(question: AIAwaitQuestion): string {
  return question.type === AIAwaitQuestionType.DateTime
    ? "YYYY-MM-DD HH:mm:ss"
    : "YYYY-MM-DD";
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  const next = new Date(year, month - 1, day);
  return (
    next.getFullYear() === year
    && next.getMonth() === month - 1
    && next.getDate() === day
  );
}

export function isValidAwaitingDateAnswer(
  question: AIAwaitQuestion,
  answer: unknown,
): boolean {
  if (typeof answer !== "string") {
    return false;
  }

  const format = getAwaitingDateFormat(question);
  if (format === "YYYY-MM-DD") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(answer);
    if (!match) {
      return false;
    }
    return isValidDateParts(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
    );
  }

  const match =
    /^(\d{4})-(\d{2})-(\d{2}) ([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.exec(
      answer,
    );
  if (!match) {
    return false;
  }
  return isValidDateParts(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  );
}

export function getSelectOptionValue(option: AIAwaitQuestionOption): string {
  return option.value ?? option.label;
}

export function getSelectOptionTooltip(
  option: AIAwaitQuestionOption,
):
  | { kind: "preview"; html: string }
  | { kind: "description"; text: string }
  | null {
  const previewHtml = option.previewHtml?.trim();
  if (previewHtml) {
    return {
      kind: "preview",
      html: previewHtml,
    };
  }

  const description = option.description?.trim();
  if (description) {
    return {
      kind: "description",
      text: description,
    };
  }

  return null;
}

export function getSelectOptions(
  question: AIAwaitQuestion,
): AIAwaitQuestionOption[] {
  return Array.isArray(question.options) ? question.options : [];
}

export function getSelectOptionValues(question: AIAwaitQuestion): string[] {
  return getSelectOptions(question).map(getSelectOptionValue);
}

export function getSelectFreeTextAnswer(
  question: AIAwaitQuestion,
  value: AIAwaitQuestionSubmitParamData | undefined,
): string {
  const optionValues = new Set(getSelectOptionValues(question));
  if (isMultiSelectQuestionType(question)) {
    return (
      value?.answers?.find((item) => item && !optionValues.has(item)) || ""
    );
  }
  return typeof value?.answer === "string" && !optionValues.has(value.answer)
    ? value.answer
    : "";
}

export function getSelectedOptionAnswers(
  question: AIAwaitQuestion,
  value: AIAwaitQuestionSubmitParamData | undefined,
): string[] {
  const optionValues = new Set(getSelectOptionValues(question));
  if (isMultiSelectQuestionType(question)) {
    return (value?.answers || []).filter((item) => optionValues.has(item));
  }
  return typeof value?.answer === "string" && optionValues.has(value.answer)
    ? [value.answer]
    : [];
}

export function getSelectGroupValue(
  question: AIAwaitQuestion,
  value: AIAwaitQuestionSubmitParamData | undefined,
): string[] {
  const selected = getSelectedOptionAnswers(question, value);
  if (question.allowFreeText && getSelectFreeTextAnswer(question, value)) {
    return [...selected, "freeText"];
  }
  return selected;
}

function hasTextAnswer(value: AIAwaitQuestionSubmitParamData | undefined): boolean {
  return typeof value?.answer === "string" && value.answer.trim().length > 0;
}

export function getAwaitingAnswerError(
  question: AIAwaitQuestion,
  value: AIAwaitQuestionSubmitParamData | undefined,
): string | null {
  if (
    question.type === AIAwaitQuestionType.Text ||
    question.type === AIAwaitQuestionType.Password
  ) {
    return hasTextAnswer(value) ? null : "请输入内容";
  }

  if (question.type === AIAwaitQuestionType.Number) {
    return typeof value?.answer === "number" && Number.isFinite(value.answer)
      ? null
      : "请输入数字";
  }

  if (
    question.type === AIAwaitQuestionType.Date ||
    question.type === AIAwaitQuestionType.DateTime
  ) {
    return isValidAwaitingDateAnswer(question, value?.answer)
      ? null
      : `请选择有效日期，格式为 ${getAwaitingDateFormat(question)}`;
  }

  if (question.type === AIAwaitQuestionType.MultiSelect) {
    const answers = buildQuestionSubmitParams(
      [question],
      value ? [value] : [],
    )[0]?.answers;
    return Array.isArray(answers) && answers.length > 0
      ? null
      : "请至少选择一个选项";
  }

  if (question.type === AIAwaitQuestionType.Select) {
    return hasTextAnswer(value) ? null : "请选择一个选项";
  }

  return null;
}

export function findAwaitingAnswerError(
  questions: AIAwaitQuestion[] | null | undefined,
  params: AIAwaitQuestionSubmitParamData[] | null | undefined,
): { index: number; message: string } | null {
  const normalizedQuestions = Array.isArray(questions) ? questions : [];
  const normalizedParams = Array.isArray(params) ? params : [];

  for (let index = 0; index < normalizedQuestions.length; index += 1) {
    const message = getAwaitingAnswerError(
      normalizedQuestions[index],
      normalizedParams[index],
    );
    if (message) {
      return { index, message };
    }
  }

  return null;
}

export function buildQuestionSubmitParams(
  questions: AIAwaitQuestion[] | null | undefined,
  params: AIAwaitQuestionSubmitParamData[] | null | undefined,
): AIAwaitQuestionSubmitParamData[] {
  const normalizedQuestions = Array.isArray(questions) ? questions : [];
  const normalizedParams = Array.isArray(params) ? params : [];

  return normalizedQuestions.map((question, index) => {
    const value = normalizedParams[index];
    const next: AIAwaitQuestionSubmitParamData = {
      id: question.id,
    };

    if (typeof value?.answer === "number" && Number.isFinite(value.answer)) {
      next.answer = value.answer;
      return next;
    }

    if (typeof value?.answer === "string" && value.answer.trim()) {
      next.answer = value.answer.trim();
      return next;
    }

    if (Array.isArray(value?.answers)) {
      const answers = value.answers
        .map((item) => String(item).trim())
        .filter(Boolean);
      if (answers.length > 0) {
        next.answers = answers;
      }
    }

    return next;
  });
}
