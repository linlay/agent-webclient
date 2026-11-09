import type { ActiveAwaiting } from "./toolsState";
import { AIAwaitQuestionType } from "@/shared/contracts/agentEvents";
import type { AIAwaitQuestionSubmitParamData } from "@/shared/contracts/agentEvents";
import { findAwaitingAnswerError } from "../components/buildin/confirm-dialog/state";

export function applyQuestionDraft(current: ActiveAwaiting | null, raw: unknown): ActiveAwaiting | null {
  if (!current || current.mode !== "question" || current.resolutionReason || !raw || typeof raw !== "object") return current;
  const draft = raw as Record<string, unknown>;
  if (typeof draft.revision !== "number" || !Number.isSafeInteger(draft.revision) || draft.revision <= (current.questionDraft?.revision || 0) || !Array.isArray(draft.answers)) return current;
  const answers: AIAwaitQuestionSubmitParamData[] = [];
  const seen = new Set<string>();
  for (const rawAnswer of draft.answers) {
    if (!rawAnswer || typeof rawAnswer !== "object") return current;
    const item = rawAnswer as Record<string, unknown>;
    const question = current.questions.find(q => q.id === item.id);
    if (!question || question.type === AIAwaitQuestionType.Password || seen.has(question.id)) return current;
    seen.add(question.id);
    let answer: AIAwaitQuestionSubmitParamData;
    if (question.type === AIAwaitQuestionType.MultiSelect) {
      if (!Array.isArray(item.answers) || !item.answers.every(value => typeof value === "string")) return current;
      answer = { id: question.id, answers: [...item.answers] };
    } else {
      if (typeof item.answer !== "string" && typeof item.answer !== "number") return current;
      let value = item.answer;
      if (question.type === AIAwaitQuestionType.DateTime && typeof value === "string") {
        value = value.replace("T", " ");
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) value += ":00";
      }
      answer = { id: question.id, answer: value };
    }
    if (findAwaitingAnswerError([question], [answer])) return current;
    answers.push(answer);
  }
  return { ...current, questionDraft: { revision: draft.revision, answers } };
}
