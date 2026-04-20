import type {
  ActiveAwaiting,
  AgentEvent,
  AIAwaitApproval,
  AIAwaitForm,
  AIAwaitMode,
  AIAwaitQuestion,
  FormActiveAwaiting,
} from '@/app/state/types';
import {
  AIAwaitEventTypeEnum,
  AIAwaitQuestionType,
  ViewportTypeEnum,
} from '@/app/state/types';
import { toText } from '@/shared/utils/eventUtils';
import {
  clearAwaitingQuestionMeta,
  registerAwaitingApprovalMeta,
  registerAwaitingFormMeta,
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

function cloneApprovals(approvals: AIAwaitApproval[]): AIAwaitApproval[] {
  return approvals.map((approval) => ({
    ...approval,
    options: Array.isArray(approval.options)
      ? approval.options.map((option) => ({ ...option }))
      : undefined,
  }));
}

function clonePayload(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  return payload ? { ...payload } : null;
}

function cloneForms(forms: AIAwaitForm[]): AIAwaitForm[] {
  return forms.map((form) => ({
    ...form,
    initialPayload: clonePayload(form.initialPayload),
  }));
}

export function cloneActiveAwaiting(
  awaiting: ActiveAwaiting | null,
): ActiveAwaiting | null {
  if (!awaiting) {
    return null;
  }

  if (awaiting.mode === 'question') {
    return {
      ...awaiting,
      questions: cloneQuestions(awaiting.questions),
    };
  }

  if (awaiting.mode === 'approval') {
    return {
      ...awaiting,
      approvals: cloneApprovals(awaiting.approvals),
    };
  }

  return {
    ...awaiting,
    forms: cloneForms(awaiting.forms),
  };
}

function createFormRuntimeState(
  current: ActiveAwaiting | null,
  key: string,
): Pick<FormActiveAwaiting, 'loading' | 'loadError' | 'viewportHtml'> {
  if (current?.key === key && current.mode === 'form') {
    return {
      loading: current.loading,
      loadError: current.loadError,
      viewportHtml: current.viewportHtml,
    };
  }

  return {
    loading: false,
    loadError: '',
    viewportHtml: '',
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

function readAwaitingMode(event: AgentEvent): AIAwaitMode | undefined {
  if (!hasOwnField(event, 'mode')) {
    return undefined;
  }

  const mode = toText(event.mode);
  return mode === 'question' || mode === 'approval' || mode === 'form'
    ? mode
    : undefined;
}

function readAwaitingPayload(
  value: unknown,
): Record<string, unknown> | null | undefined {
  // Deprecated: only kept for legacy HTML awaiting event replay compatibility.
  if (value === undefined) {
    return undefined;
  }

  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
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
        id: toText(question.id) || toText(question.question),
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
        normalized.multiple =
          typeof question.multiple === 'boolean'
            ? question.multiple
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
    .filter((question) => Boolean(question.id) && Boolean(question.question));
}

function normalizeApprovals(value: unknown): AIAwaitApproval[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is AIAwaitApproval =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    )
    .map((approval) => ({
      id: toText(approval.id) || toText(approval.command),
      command: toText(approval.command),
      ruleKey: toText(approval.ruleKey) || undefined,
      description: toText(approval.description) || undefined,
      options: Array.isArray(approval.options)
        ? approval.options
            .filter(
              (option) =>
                Boolean(option)
                && typeof option === 'object'
                && !Array.isArray(option),
            )
            .map((option) => ({
              label: toText(option.label),
              decision: toText(option.decision),
              description: toText(option.description) || undefined,
            }))
            .filter((option) => Boolean(option.label) && Boolean(option.decision))
        : undefined,
      allowFreeText:
        typeof approval.allowFreeText === 'boolean'
          ? approval.allowFreeText
          : undefined,
      freeTextPlaceholder:
        toText(approval.freeTextPlaceholder) || undefined,
    }))
    .filter((approval) => Boolean(approval.id) && Boolean(approval.command));
}

function normalizeForms(
  value: unknown,
  fallbackAction = '',
  fallbackPayload?: Record<string, unknown> | null,
  viewportPayload?: Record<string, unknown> | null,
): AIAwaitForm[] {
  if (!Array.isArray(value)) {
    if (!fallbackAction) {
      return [];
    }
    return [
      {
        id: fallbackAction,
        action: fallbackAction,
        initialPayload: fallbackPayload ?? null,
      },
    ];
  }

  const normalized = value
    .filter(
      (item): item is AIAwaitForm =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    )
    .map((form, index) => {
      const payloadForms = Array.isArray(viewportPayload?.forms)
        ? viewportPayload.forms
        : [];
      const viewportForm = payloadForms[index];
      const command = viewportForm && typeof viewportForm === 'object' && !Array.isArray(viewportForm)
        ? toText((viewportForm as Record<string, unknown>).command) || undefined
        : undefined;
      return {
        id: toText(form.id) || toText(form.action),
        action: toText(form.action) || fallbackAction,
        command,
        initialPayload: readAwaitingPayload(form.initialPayload),
      };
    })
    .filter((form) => Boolean(form.id) && Boolean(form.action));

  if (normalized.length > 0) {
    return normalized;
  }

  if (!fallbackAction) {
    return [];
  }

  return [
    {
      id: fallbackAction,
      action: fallbackAction,
      initialPayload: fallbackPayload ?? null,
    },
  ];
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

function isLegacyQuestionAsk(event: AgentEvent): boolean {
  if (toText(event.type) !== AIAwaitEventTypeEnum.Ask || readAwaitingMode(event)) {
    return false;
  }

  const viewportType = toText(event.viewportType);
  if (viewportType === ViewportTypeEnum.Html) {
    return false;
  }

  return !Array.isArray((event as Record<string, unknown>).approvals)
    && !Array.isArray((event as Record<string, unknown>).forms);
}

function isLegacyHtmlAsk(event: AgentEvent): boolean {
  // Deprecated: only kept for legacy HTML awaiting event replay compatibility.
  return (
    toText(event.type) === AIAwaitEventTypeEnum.Ask
    && !readAwaitingMode(event)
    && toText(event.viewportType) === ViewportTypeEnum.Html
    && Boolean(toText(event.viewportKey))
  );
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
    if (current?.mode === 'question') {
      clearAwaitingQuestionMeta(current.runId, current.awaitingId);
    }
    return null;
  }

  if (type === AIAwaitEventTypeEnum.Ask) {
    const awaitingId = toText(event.awaitingId);
    const runId = toText(event.runId);
    if (!awaitingId || !runId) {
      return current;
    }

    const key = `${runId}#${awaitingId}`;
    const nextMode = readAwaitingMode(event);

    if (nextMode === 'question' || isLegacyQuestionAsk(event)) {
      const nextQuestions = normalizeQuestions(event.questions);
      if (nextQuestions.length > 0) {
        registerAwaitingQuestionMeta(runId, awaitingId, nextQuestions);
      }
      return {
        key,
        awaitingId,
        runId,
        timeout: readAwaitingTimeout(event),
        mode: 'question',
        questions:
          nextQuestions.length > 0
            ? nextQuestions
            : current?.key === key && current.mode === 'question'
            ? cloneQuestions(current.questions)
            : [],
        resolvedByOther:
          current?.key === key ? current.resolvedByOther : undefined,
      };
    }

    if (nextMode === 'approval') {
      const nextApprovals = normalizeApprovals(event.approvals);
      if (nextApprovals.length > 0) {
        registerAwaitingApprovalMeta(runId, awaitingId, nextApprovals);
      }
      return {
        key,
        awaitingId,
        runId,
        timeout: readAwaitingTimeout(event),
        mode: 'approval',
        approvals:
          nextApprovals.length > 0
            ? nextApprovals
            : current?.key === key && current.mode === 'approval'
            ? cloneApprovals(current.approvals)
            : [],
        resolvedByOther:
          current?.key === key ? current.resolvedByOther : undefined,
      };
    }

    if (nextMode === 'form' || isLegacyHtmlAsk(event)) {
      const viewportKey = toText(event.viewportKey);
      const viewportType = toText(event.viewportType);
      if (!viewportKey || viewportType !== ViewportTypeEnum.Html) {
        return current;
      }
      const nextForms = nextMode === 'form'
        ? normalizeForms(
            event.forms,
            '',
            undefined,
            readAwaitingPayload((event as Record<string, unknown>).viewportPayload) ?? null,
          )
        : normalizeForms(
            event.forms,
            viewportKey,
            readAwaitingPayload((event as Record<string, unknown>).payload) ?? null,
          );
      if (nextForms.length > 0) {
        registerAwaitingFormMeta(runId, awaitingId, nextForms);
      }
      const runtime = createFormRuntimeState(current, key);
      return {
        key,
        awaitingId,
        runId,
        timeout: readAwaitingTimeout(event),
        mode: 'form',
        forms:
          nextForms.length > 0
            ? nextForms
            : current?.key === key && current.mode === 'form'
            ? cloneForms(current.forms)
            : [],
        viewportKey,
        viewportType: ViewportTypeEnum.Html,
        ...runtime,
        resolvedByOther:
          current?.key === key ? current.resolvedByOther : undefined,
      };
    }

    return current;
  }

  if (type === AIAwaitEventTypeEnum.Payload) {
    const awaitingId = toText(event.awaitingId);
    if (!current || current.mode !== 'question' || !awaitingId || current.awaitingId !== awaitingId) {
      return current;
    }
    const nextQuestions = normalizeQuestions(event.questions);
    if (nextQuestions.length === 0) {
      return current;
    }
    registerAwaitingQuestionMeta(current.runId, awaitingId, nextQuestions);
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
