import type {
  ActiveAwaiting,
  AgentEvent,
  AIAwaitQuestion,
} from '@/app/state/types';
import {
  AIAwaitEventTypeEnum,
  AIAwaitQuestionType,
  ViewportTypeEnum,
} from '@/app/state/types';
import { toText } from '@/shared/utils/eventUtils';
import {
  clearAwaitingQuestionMeta,
  registerAwaitingQuestionMeta,
} from '@/features/tools/lib/awaitingQuestionMeta';

export const BUILTIN_CONFIRM_DIALOG_VIEWPORT_KEY = 'confirm_dialog';

function cloneQuestions(questions: AIAwaitQuestion[]): AIAwaitQuestion[] {
  return questions.map((question) => ({
    ...question,
    options: Array.isArray(question.options)
      ? question.options.map((option) => ({ ...option }))
      : undefined,
  }));
}

function clonePayload(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  return payload ? { ...payload } : null;
}

export function cloneActiveAwaiting(
  awaiting: ActiveAwaiting | null,
): ActiveAwaiting | null {
  return awaiting
    ? {
        ...awaiting,
        payload: clonePayload(awaiting.payload),
        questions: cloneQuestions(awaiting.questions),
      }
    : null;
}

function createAwaitingRuntimeState(
  current: ActiveAwaiting | null,
  key: string,
): Pick<
  ActiveAwaiting,
  'loading' | 'loadError' | 'viewportHtml' | 'mode' | 'payload'
> {
  if (current?.key === key) {
    return {
      loading: current.loading,
      loadError: current.loadError,
      viewportHtml: current.viewportHtml,
      mode: current.mode,
      payload: clonePayload(current.payload),
    };
  }

  return {
    loading: false,
    loadError: '',
    viewportHtml: '',
    mode: undefined,
    payload: null,
  };
}

function hasOwnField(
  value: unknown,
  key: string,
): value is Record<string, unknown> {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.prototype.hasOwnProperty.call(value, key);
}

function readAwaitingMode(
  event: AgentEvent,
): ActiveAwaiting['mode'] | undefined {
  if (!hasOwnField(event, 'mode')) {
    return undefined;
  }

  const mode = toText(event.mode);
  return mode === 'approval' || mode === 'question' ? mode : undefined;
}

function readAwaitingPayload(event: AgentEvent): Record<string, unknown> | null | undefined {
  if (!hasOwnField(event, 'payload')) {
    return undefined;
  }

  const { payload } = event;
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? { ...payload }
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

function isHtmlViewportAsk(event: AgentEvent): boolean {
  return (
    toText(event.type) === AIAwaitEventTypeEnum.Ask
    && toText(event.viewportType) === ViewportTypeEnum.Html
    && Boolean(toText(event.viewportKey))
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
    const runtime = createAwaitingRuntimeState(current, key);
    return {
      key,
      awaitingId,
      runId,
      timeout: readAwaitingTimeout(event),
      viewportKey: BUILTIN_CONFIRM_DIALOG_VIEWPORT_KEY,
      viewportType: ViewportTypeEnum.Builtin,
      ...runtime,
      questions:
        nextQuestions.length > 0
          ? nextQuestions
          : current?.key === key
          ? cloneQuestions(current.questions)
          : [],
    };
  }

  if (isHtmlViewportAsk(event)) {
    const awaitingId = toText(event.awaitingId);
    const runId = toText(event.runId);
    const viewportKey = toText(event.viewportKey);
    if (!awaitingId || !runId || !viewportKey) {
      return current;
    }
    const key = `${runId}#${awaitingId}`;
    const mode = readAwaitingMode(event);
    const payload = readAwaitingPayload(event);
    const nextQuestions = normalizeQuestions(event.questions);
    if (nextQuestions.length > 0) {
      registerAwaitingQuestionMeta(runId, awaitingId, nextQuestions);
    }
    const runtime = createAwaitingRuntimeState(current, key);
    return {
      key,
      awaitingId,
      runId,
      timeout: readAwaitingTimeout(event),
      viewportKey,
      viewportType: ViewportTypeEnum.Html,
      ...runtime,
      mode: mode ?? runtime.mode,
      payload: payload === undefined ? runtime.payload : payload,
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
