import type {
  ActiveAwaiting,
  AgentEvent,
  AIAwaitQuestion,
} from '../context/types';
import {
  AIAwaitEventTypeEnum,
  AIAwaitQuestionType,
  ViewportTypeEnum,
} from '../context/types';
import { toText } from './eventUtils';
import {
  clearAwaitingQuestionMeta,
  registerAwaitingQuestionMeta,
} from './awaitingQuestionMeta';

export const BUILTIN_CONFIRM_DIALOG_VIEWPORT_KEY = 'confirm_dialog';

function cloneQuestions(questions: AIAwaitQuestion[]): AIAwaitQuestion[] {
  return questions.map((question) => ({
    ...question,
    options: Array.isArray(question.options)
      ? question.options.map((option) => ({ ...option }))
      : undefined,
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
    .map((question) => {
      const type = toText(question.type) as AIAwaitQuestion['type'];
      const normalized: AIAwaitQuestion = {
        type,
        question: toText(question.question),
        header: toText(question.header) || undefined,
        placeholder: toText(question.placeholder) || undefined,
      };

      if (type === AIAwaitQuestionType.Select) {
        normalized.options = Array.isArray(question.options)
          ? question.options
              .filter(
                (option) =>
                  Boolean(option)
                  && typeof option === 'object'
                  && !Array.isArray(option),
              )
              .map((option) => ({ ...option }))
          : [];
        normalized.multiSelect =
          typeof question.multiSelect === 'boolean'
            ? question.multiSelect
            : undefined;
        normalized.allowFreeText =
          typeof question.allowFreeText === 'boolean'
            ? question.allowFreeText
            : undefined;
        normalized.freeTextPlaceholder =
          toText(question.freeTextPlaceholder) || undefined;
      }

      return normalized;
    })
    .filter((question) => Boolean(question.question));
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
    if (current) {
      clearAwaitingQuestionMeta(current.runId, current.awaitingId);
    }
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
    if (nextQuestions.length > 0) {
      registerAwaitingQuestionMeta(runId, awaitingId, nextQuestions);
    }
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
    const nextQuestions = normalizeQuestions(event.questions);
    if (nextQuestions.length > 0) {
      registerAwaitingQuestionMeta(current.runId, awaitingId, nextQuestions);
    }
    return {
      ...current,
      questions: nextQuestions,
    };
  }

  if (type === AIAwaitEventTypeEnum.Answer) {
    const awaitingId = toText(event.awaitingId);
    if (!current || !awaitingId || current.awaitingId !== awaitingId) {
      return current;
    }
    return {
      ...current,
      resolvedByOther: true,
    };
  }

  return current;
}
