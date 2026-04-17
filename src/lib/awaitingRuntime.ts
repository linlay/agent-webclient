import type {
  ActiveAwaiting,
  AgentEvent,
  AIAwaitQuestion,
} from '../context/types';
import {
  AIAwaitEventTypeEnum,
  ViewportTypeEnum,
} from '../context/types';
import { toText } from './eventUtils';

export const BUILTIN_CONFIRM_DIALOG_VIEWPORT_KEY = 'confirm_dialog';

function cloneQuestions(questions: AIAwaitQuestion[]): AIAwaitQuestion[] {
  return questions.map((question) => ({
    ...question,
    options: Array.isArray(question.options)
      ? question.options.map((option) => ({ ...option }))
      : [],
  }));
}

export function cloneActiveAwaiting(
  awaiting: ActiveAwaiting | null,
): ActiveAwaiting | null {
  return awaiting
    ? {
        ...awaiting,
        questions: cloneQuestions(awaiting.questions),
      }
    : null;
}

function normalizeQuestions(value: unknown): AIAwaitQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      (item): item is AIAwaitQuestion =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    )
    .map((question) => ({
      ...question,
      options: Array.isArray(question.options)
        ? question.options
            .filter((option) => Boolean(option) && typeof option === 'object' && !Array.isArray(option))
            .map((option) => ({ ...option }))
        : [],
    }));
}

function isBuiltinConfirmDialogAsk(event: AgentEvent): boolean {
  return (
    toText(event.type) === AIAwaitEventTypeEnum.Ask
    && toText(event.viewportType) === ViewportTypeEnum.Builtin
    && toText(event.viewportKey) === BUILTIN_CONFIRM_DIALOG_VIEWPORT_KEY
  );
}

function readAwaitingTimeout(event: AgentEvent): number | null {
  const timeout = Number(event.timeout);
  if (Number.isFinite(timeout)) {
    return timeout;
  }

  const fallbackTimeout = Number(
    (event as Record<string, unknown>).toolTimeout,
  );
  return Number.isFinite(fallbackTimeout) ? fallbackTimeout : null;
}

export function reduceActiveAwaiting(
  current: ActiveAwaiting | null,
  event: AgentEvent,
): ActiveAwaiting | null {
  const type = toText(event.type);

  if (
    type === 'request.query'
    || type === 'run.start'
    || type === 'run.error'
    || type === 'run.complete'
    || type === 'run.cancel'
  ) {
    return null;
  }

  if (isBuiltinConfirmDialogAsk(event)) {
    const awaitingId = toText(event.awaitingId);
    const runId = toText(event.runId);
    if (!awaitingId || !runId) {
      return current;
    }
    const key = `${runId}#${awaitingId}`;
    const nextQuestions = normalizeQuestions(event.questions);
    return {
      key,
      awaitingId,
      runId,
      timeout: readAwaitingTimeout(event),
      viewportKey: BUILTIN_CONFIRM_DIALOG_VIEWPORT_KEY,
      viewportType: ViewportTypeEnum.Builtin,
      questions:
        nextQuestions.length > 0
          ? nextQuestions
          : current?.key === key
          ? cloneQuestions(current.questions)
          : [],
    };
  }

  if (type === AIAwaitEventTypeEnum.Payload) {
    const awaitingId = toText(event.awaitingId);
    if (!current || !awaitingId || current.awaitingId !== awaitingId) {
      return current;
    }
    return {
      ...current,
      questions: normalizeQuestions(event.questions),
    };
  }

  return current;
}
