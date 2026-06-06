import type {
  ActiveAwaiting,
  AgentEvent,
  AIAwaitApproval,
  AIAwaitForm,
  AIAwaitMode,
  AIAwaitPlan,
  AIAwaitPlanDecision,
  AIAwaitQuestion,
  FormActiveAwaiting,
} from '@/app/state/types';
import {
  AIAwaitQuestionType,
  ViewportTypeEnum,
  isAwaitingAnswerStreamEvent,
  isAwaitingAskStreamEvent,
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

function cloneFormData(
  form: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  return form ? { ...form } : null;
}

function cloneForms(forms: AIAwaitForm[]): AIAwaitForm[] {
  return forms.map((form) => ({
    ...form,
    form: cloneFormData(form.form),
  }));
}

function clonePlan(plan: AIAwaitPlan): AIAwaitPlan {
  return {
    ...plan,
    options: Array.isArray(plan.options)
      ? plan.options.map((option) => ({
          ...option,
          input: option.input ? { ...option.input } : undefined,
        }))
      : undefined,
  };
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

  if (awaiting.mode === 'plan') {
    return {
      ...awaiting,
      plan: clonePlan(awaiting.plan),
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
  return mode === 'question' || mode === 'approval' || mode === 'form' || mode === 'plan'
    ? mode
    : undefined;
}

function readAwaitingForm(
  value: unknown,
): Record<string, unknown> | null | undefined {
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

      if (
        type === AIAwaitQuestionType.Select
        || type === AIAwaitQuestionType.MultiSelect
      ) {
        normalized.options = Array.isArray(question.options)
          ? question.options
              .filter(
                (option) =>
                  Boolean(option)
                  && typeof option === 'object'
                  && !Array.isArray(option),
              )
              .map((option) => ({
                label: toText(option.label),
                description: toText(option.description) || undefined,
                previewHtml: toText(option.previewHtml) || undefined,
                value: toText(option.value) || undefined,
              }))
              .filter((option) => Boolean(option.label))
          : [];
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
    .map((approval) => {
      const options = Array.isArray(approval.options)
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
            .filter(
              (option) =>
                Boolean(option.label)
                && (
                  option.decision === 'approve'
                  || option.decision === 'reject'
                  || option.decision === 'approve_rule_run'
                ),
            )
        : undefined;
      return {
        id: toText(approval.id) || toText(approval.command),
        command: toText(approval.command),
        ruleKey: toText(approval.ruleKey) || undefined,
        description: toText(approval.description) || undefined,
        options,
        allowFreeText:
          typeof approval.allowFreeText === 'boolean'
            ? approval.allowFreeText
            : undefined,
        freeTextPlaceholder:
          toText(approval.freeTextPlaceholder) || undefined,
      };
    })
    .filter((approval) => Boolean(approval.id) && Boolean(approval.command));
}

function normalizeForms(
  value: unknown,
  fallbackAction = '',
  fallbackForm?: Record<string, unknown> | null,
): AIAwaitForm[] {
  if (!Array.isArray(value)) {
    if (!fallbackAction) {
      return [];
    }
    return [
      {
        id: fallbackAction,
        action: fallbackAction,
        form: fallbackForm ?? null,
      },
    ];
  }

  const normalized = value
    .filter(
      (item): item is AIAwaitForm =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    )
    .map((form) => {
      const action = toText(form.action) || fallbackAction;
      return {
        id: toText(form.id) || action,
        action: action || undefined,
        title: toText(form.title) || undefined,
        form: readAwaitingForm(form.form),
      };
    })
    .filter((form) => Boolean(form.id));

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
      form: fallbackForm ?? null,
    },
  ];
}

function normalizePlan(value: unknown): AIAwaitPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const plan = value as Record<string, unknown>;
  const id = toText(plan.id);
  if (!id) {
    return null;
  }

  const normalized: AIAwaitPlan = {
    id,
    planningId: toText(plan.planningId) || undefined,
    title: toText(plan.title) || undefined,
    options: Array.isArray(plan.options)
      ? plan.options
          .filter(
            (option) =>
              Boolean(option)
              && typeof option === 'object'
              && !Array.isArray(option),
          )
          .map((option) => {
            const item = option as Record<string, unknown>;
            const input = item.input;
            const normalizedInput =
              input && typeof input === 'object' && !Array.isArray(input)
                ? {
                    type: toText((input as Record<string, unknown>).type) as 'text',
                    placeholder:
                      toText((input as Record<string, unknown>).placeholder)
                      || undefined,
                    required:
                      typeof (input as Record<string, unknown>).required === 'boolean'
                        ? Boolean((input as Record<string, unknown>).required)
                        : undefined,
                  }
                : undefined;
            return {
              label: toText(item.label),
              description: toText(item.description) || undefined,
              decision: toText(item.decision) as AIAwaitPlanDecision,
              input: normalizedInput?.type === 'text' ? normalizedInput : undefined,
            };
          })
          .filter(
            (option) =>
              Boolean(option.label)
              && (option.decision === 'approve' || option.decision === 'reject'),
          )
      : undefined,
  };

  return normalized;
}

function readAwaitingTimeout(event: AgentEvent): number | null {
  const timeout = Number(event.timeout);
  return Number.isFinite(timeout) ? timeout : null;
}

function readAwaitingCreatedAt(event: AgentEvent): number | null {
  const createdAt = Number((event as Record<string, unknown>).createdAt);
  if (Number.isFinite(createdAt) && createdAt > 0) {
    return createdAt;
  }

  const timestamp = Number(event.timestamp);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

export function reduceActiveAwaiting(
  current: ActiveAwaiting | null,
  event: AgentEvent,
  fallback: { agentKey?: string } = {},
): ActiveAwaiting | null {
  const type = toText(event.type);
  const eventAgentKey = toText(event.agentKey);

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

  if (isAwaitingAskStreamEvent(type)) {
    const awaitingId = toText(event.awaitingId);
    const runId = toText(event.runId);
    if (!awaitingId || !runId) {
      return current;
    }

    const key = `${runId}#${awaitingId}`;
    const nextMode = readAwaitingMode(event);
    const createdAt =
      readAwaitingCreatedAt(event)
      ?? (current?.key === key ? current.createdAt ?? null : null);
    const agentKey =
      eventAgentKey
      || (current?.key === key ? current.agentKey : '')
      || toText(fallback.agentKey);

    if (nextMode === 'question') {
      const nextQuestions = normalizeQuestions(event.questions);
      if (nextQuestions.length > 0) {
        registerAwaitingQuestionMeta(runId, awaitingId, nextQuestions);
      }
      return {
        key,
        awaitingId,
        runId,
        agentKey,
        timeout: readAwaitingTimeout(event),
        createdAt,
        mode: 'question',
        questions:
          nextQuestions.length > 0
            ? nextQuestions
            : current?.key === key && current.mode === 'question'
            ? cloneQuestions(current.questions)
            : [],
        resolvedByOther:
          current?.key === key ? current.resolvedByOther : undefined,
        pendingSubmitId:
          current?.key === key ? current.pendingSubmitId : undefined,
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
        agentKey,
        timeout: readAwaitingTimeout(event),
        createdAt,
        mode: 'approval',
        approvals:
          nextApprovals.length > 0
            ? nextApprovals
            : current?.key === key && current.mode === 'approval'
            ? cloneApprovals(current.approvals)
            : [],
        resolvedByOther:
          current?.key === key ? current.resolvedByOther : undefined,
        pendingSubmitId:
          current?.key === key ? current.pendingSubmitId : undefined,
      };
    }

    if (nextMode === 'form') {
      const viewportKey = toText(event.viewportKey);
      const viewportType = toText(event.viewportType);
      if (!viewportKey || viewportType !== ViewportTypeEnum.Html) {
        return current;
      }
      const nextForms = normalizeForms(event.forms);
      if (nextForms.length > 0) {
        registerAwaitingFormMeta(runId, awaitingId, nextForms);
      }
      const runtime = createFormRuntimeState(current, key);
      return {
        key,
        awaitingId,
        runId,
        agentKey,
        timeout: readAwaitingTimeout(event),
        createdAt,
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
        pendingSubmitId:
          current?.key === key ? current.pendingSubmitId : undefined,
      };
    }

    if (nextMode === 'plan') {
      const nextPlan = normalizePlan((event as Record<string, unknown>).plan);
      if (!nextPlan && !(current?.key === key && current.mode === 'plan')) {
        return current;
      }
      return {
        key,
        awaitingId,
        runId,
        agentKey,
        timeout: readAwaitingTimeout(event),
        createdAt,
        mode: 'plan',
        plan:
          nextPlan
          ?? (current?.key === key && current.mode === 'plan'
            ? clonePlan(current.plan)
            : { id: 'confirm' }),
        resolvedByOther:
          current?.key === key ? current.resolvedByOther : undefined,
        pendingSubmitId:
          current?.key === key ? current.pendingSubmitId : undefined,
      };
    }

    return current;
  }

  if (isAwaitingAnswerStreamEvent(type)) {
    const awaitingId = toText(event.awaitingId);
    const runId = toText(event.runId);
    if (!current || !awaitingId || current.awaitingId !== awaitingId) {
      return current;
    }
    if (runId && current.runId !== runId) {
      return current;
    }
    const submitId = toText((event as Record<string, unknown>).submitId);
    if (submitId && current.pendingSubmitId === submitId) {
      if (current.mode === 'question') {
        clearAwaitingQuestionMeta(current.runId, current.awaitingId);
      }
      return null;
    }
    return {
      ...current,
      resolvedByOther: true,
    };
  }

  return current;
}
