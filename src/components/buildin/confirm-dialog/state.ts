import type { AIAwaitQuestion } from "../../../context/types";

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
