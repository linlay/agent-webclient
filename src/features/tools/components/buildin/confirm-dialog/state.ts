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
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    element.isContentEditable
  );
}

export function getAwaitingQuestionHeading(question: AIAwaitQuestion): string {
  return question.question?.trim() || question.header?.trim() || "";
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
  if (question.type === AIAwaitQuestionType.Select) {
    return question.freeTextPlaceholder || "";
  }
  return question.placeholder || "";
}

export function getSelectOptionValue(option: AIAwaitQuestionOption): string {
  return option.value ?? option.label;
}

export function getSelectOptions(
  question: AIAwaitQuestion,
): AIAwaitQuestionOption[] {
  return Array.isArray(question.options) ? question.options : [];
}

export function getSelectOptionValues(question: AIAwaitQuestion): string[] {
  return getSelectOptions(question).map(getSelectOptionValue);
}

export function getAwaitingAnswerError(
  question: AIAwaitQuestion,
  value: AIAwaitQuestionSubmitParamData | undefined,
): string | null {
  switch (question.type) {
    case AIAwaitQuestionType.Select:
      if (question.multiple) {
        return Array.isArray(value?.answers) &&
          value.answers.some((item) => item.trim())
          ? null
          : "请至少选择一个选项";
      }
      return typeof value?.answer === "string" && value.answer.trim()
        ? null
        : "请选择或输入一个答案";
    case AIAwaitQuestionType.Text:
    case AIAwaitQuestionType.Password:
      return typeof value?.answer === "string" && value.answer.trim()
        ? null
        : "请输入内容";
    case AIAwaitQuestionType.Number:
      return typeof value?.answer === "number" && Number.isFinite(value.answer)
        ? null
        : "请输入有效数字";
    default:
      return "当前题型暂不支持";
  }
}

export function getSelectFreeTextAnswer(
  question: AIAwaitQuestion,
  value: AIAwaitQuestionSubmitParamData | undefined,
): string {
  const optionValues = new Set(getSelectOptionValues(question));
  if (question.multiple) {
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
  if (question.multiple) {
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
