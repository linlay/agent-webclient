import type { AIAwaitQuestion } from "../../../context/types";
import {
  clampAwaitingIndex,
  createAwaitingParamPlaceholders,
  hasAwaitingQuestions,
} from "./state";

function createQuestion(question: string): AIAwaitQuestion {
  return {
    type: "select",
    question,
    options: [
      {
        label: "继续",
        description: "允许继续执行",
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
});
