import type { ActiveAwaiting, FormActiveAwaiting } from "@/features/tools/lib/toolsState";
import type { AIAwaitApprovalSubmitParamData, AIAwaitFormSubmitParamData, AIAwaitMode, AIAwaitPlanSubmitParamData, AIAwaitQuestionSubmitParamData, AIAwaitSubmitParam, AIAwaitSubmitParamData, AIAwaitSubmitPayloadData } from "@/shared/contracts/agentEvents";

export type AwaitingRenderMode = 'none' | 'builtin' | 'html';
export type AwaitingCollectDecision = 'submit' | 'reject';

export interface AwaitingViewData {
  runId: string;
  awaitingId: string;
  view?: import("@/shared/contracts/view").ViewReference;
  mode: 'form';
  timeout: number | null;
  form: { title?: string; data: Record<string, unknown> | null };
}

export interface AwaitingViewMessage {
  type: 'awaiting_init' | 'awaiting_update';
  data: AwaitingViewData;
}

export interface AwaitingCollectMessage {
  type: 'awaiting_collect';
  data: {
    runId: string;
    awaitingId: string;
    decision: AwaitingCollectDecision;
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isModeWithBuiltinDialog(mode: AIAwaitMode | undefined): boolean {
  return mode === 'question' || mode === 'approval' || mode === 'plan';
}

function cloneFormData(
  form: FormActiveAwaiting['forms'][number] | undefined,
): Record<string, unknown> | null {
  return form?.form ? { ...form.form } : null;
}

function clampActiveFormIndex(
  activeFormIndex: number,
  forms: FormActiveAwaiting['forms'],
): number {
  if (forms.length <= 1) {
    return 0;
  }
  return Math.min(forms.length - 1, Math.max(0, activeFormIndex));
}

export function getAwaitingRenderMode(
  awaiting: ActiveAwaiting | null,
): AwaitingRenderMode {
  if (!awaiting) {
    return 'none';
  }

  if (awaiting.mode === 'form' && awaiting.viewKey.trim()) {
    return 'html';
  }

  if (isModeWithBuiltinDialog(awaiting.mode)) {
    return 'builtin';
  }

  if ('viewRenderer' in awaiting && awaiting.viewRenderer && awaiting.viewKey.trim()) {
    return 'html';
  }

  if ('questions' in awaiting || 'approvals' in awaiting || 'plan' in awaiting) {
    return 'builtin';
  }

  return 'none';
}

export function buildAwaitingViewData(
  awaiting: FormActiveAwaiting,
  activeFormIndex = 0,
): AwaitingViewData {
  const forms = awaiting.forms ?? [];
  const resolvedActiveFormIndex = clampActiveFormIndex(activeFormIndex, forms);
  const activeForm = forms[resolvedActiveFormIndex];
  return {
    runId: awaiting.runId,
    awaitingId: awaiting.awaitingId,
    ...(awaiting.view ? { view: awaiting.view } : {}),
    mode: 'form',
    timeout: awaiting.timeout,
    form: {
      ...(activeForm?.title ? { title: activeForm.title } : {}),
      data: cloneFormData(activeForm),
    },
  };
}

export function buildAwaitingViewSignature(
  awaiting: FormActiveAwaiting,
  activeFormIndex = 0,
): string {
  return JSON.stringify(buildAwaitingViewData(awaiting, activeFormIndex));
}

export function buildAwaitingInitMessage(
  awaiting: FormActiveAwaiting,
  activeFormIndex = 0,
): AwaitingViewMessage {
  return {
    type: 'awaiting_init',
    data: buildAwaitingViewData(awaiting, activeFormIndex),
  };
}

export function buildAwaitingUpdateMessage(
  awaiting: FormActiveAwaiting,
  activeFormIndex = 0,
): AwaitingViewMessage {
  return {
    type: 'awaiting_update',
    data: buildAwaitingViewData(awaiting, activeFormIndex),
  };
}

export function buildAwaitingCollectMessage(
  awaiting: FormActiveAwaiting,
  decision: AwaitingCollectDecision,
): AwaitingCollectMessage {
  return {
    type: 'awaiting_collect',
    data: {
      runId: awaiting.runId,
      awaitingId: awaiting.awaitingId,
      decision,
    },
  };
}

function normalizeQuestionSubmitParam(
  item: Record<string, unknown>,
): AIAwaitQuestionSubmitParamData | null {
  const id = String(item.id || '').trim();
  if (!id) {
    return null;
  }
  const answerValue = item.answer;
  const answersValue = item.answers;
  if (
    typeof answerValue !== 'string'
    && typeof answerValue !== 'number'
    && !Array.isArray(answersValue)
  ) {
    return null;
  }

  const normalized: AIAwaitQuestionSubmitParamData = { id };
  if (typeof answerValue === 'string' || typeof answerValue === 'number') {
    normalized.answer = answerValue;
  }
  if (Array.isArray(answersValue)) {
    normalized.answers = answersValue
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
  }
  return normalized;
}

function normalizeApprovalSubmitParam(
  item: Record<string, unknown>,
): AIAwaitApprovalSubmitParamData | null {
  const id = String(item.id || '').trim();
  const decision = String(item.decision || '').trim();
  if (!id || !decision) {
    return null;
  }
  if (
    decision !== 'approve'
    && decision !== 'reject'
    && decision !== 'approve_rule_run'
  ) {
    return null;
  }

  return {
    id,
    decision,
    reason: String(item.reason || '').trim() || undefined,
  };
}

function normalizeFormSubmitParam(
  item: Record<string, unknown>,
): AIAwaitFormSubmitParamData | null {
  const id = String(item.id || '').trim();
  const decision = String(item.decision || '').trim();
  if (!id) {
    return null;
  }
  if (decision !== 'approve' && decision !== 'reject') {
    return null;
  }

  if (decision === 'approve') {
    const form = isObjectRecord(item.form)
      ? { ...item.form }
      : item.form == null
      ? undefined
      : null;
    if (form == null) {
      return null;
    }
    return {
      id,
      decision,
      form,
    };
  }

  const form = decision === 'reject'
    ? isObjectRecord(item.form)
      ? { ...item.form }
      : item.form == null
      ? undefined
      : null
    : undefined;

  if (form === null) {
    return null;
  }

  return {
    id,
    decision,
    ...(decision === 'reject' && String(item.reason || '').trim()
      ? { reason: String(item.reason || '').trim() }
      : {}),
    ...(form !== undefined ? { form } : {}),
  };
}

function normalizePlanSubmitParam(
  item: Record<string, unknown>,
): AIAwaitPlanSubmitParamData | null {
  if (
    'answer' in item
    || 'answers' in item
    || 'payload' in item
    || 'form' in item
  ) {
    return null;
  }

  const decision = String(item.decision || '').trim();
  if (decision !== 'approve' && decision !== 'reject') {
    return null;
  }

  const id = String(item.id || '').trim();
  const reason = String(item.reason || '').trim();
  const planningId = String(item.planningId || '').trim();
  return {
    ...(id ? { id } : {}),
    decision,
    ...(reason ? { reason } : {}),
    ...(planningId ? { planningId } : {}),
  };
}

export function normalizeAwaitingSubmitParams(
  value: unknown,
  mode?: AIAwaitMode,
): AIAwaitSubmitParamData[] {
  if (!Array.isArray(value)) {
    return [];
  }
  if (mode === 'plan' && value.length !== 1) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => isObjectRecord(item))
    .map((item) => {
      if (mode === 'question') {
        return normalizeQuestionSubmitParam(item);
      }
      if (mode === 'approval') {
        return normalizeApprovalSubmitParam(item);
      }
      if (mode === 'form') {
        return normalizeFormSubmitParam(item);
      }
      if (mode === 'plan') {
        return normalizePlanSubmitParam(item);
      }
      return (
        normalizeApprovalSubmitParam(item)
        ?? normalizeFormSubmitParam(item)
        ?? normalizePlanSubmitParam(item)
        ?? normalizeQuestionSubmitParam(item)
      );
    })
    .filter((item): item is AIAwaitSubmitParamData => Boolean(item));
}

/** Reads a template reply ({type, param: {decision, data}}) into the
 * container's item list. The form is identified by the awaiting. */
export function readAwaitingSubmitPayload(
  value: unknown,
  awaiting: ActiveAwaiting,
): AIAwaitSubmitPayloadData | null {
  if (!isObjectRecord(value) || value.type !== 'frontend_awaiting_submit') {
    return null;
  }
  if (awaiting.mode !== 'form' || !isObjectRecord(value.param)) {
    return null;
  }
  const { decision, data, reason } = value.param;
  if ((decision !== 'approve' && decision !== 'reject') || (data !== undefined && !isObjectRecord(data))) {
    return null;
  }
  if (decision === 'approve' && data === undefined) {
    return null;
  }
  const params = normalizeAwaitingSubmitParams([{
    id: awaiting.forms[0]?.id || awaiting.awaitingId,
    decision,
    ...(data !== undefined ? { form: data } : {}),
    ...(typeof reason === 'string' ? { reason } : {}),
  }], 'form');
  if (params.length !== 1) {
    return null;
  }
  return {
    runId: awaiting.runId,
    awaitingId: awaiting.awaitingId,
    params,
  };
}

/** Converts the container's item list to the wire answer: planning and form
 * awaitings submit one param object, question and approval submit params. */
export function toWireAwaitingSubmit(
  mode: AIAwaitMode | undefined,
  params: AIAwaitSubmitParamData[],
): { param: AIAwaitSubmitParam } | { params: AIAwaitSubmitParamData[] } {
  if (mode !== 'form' && mode !== 'plan') {
    return { params };
  }
  const item = params[0] as (AIAwaitFormSubmitParamData & AIAwaitPlanSubmitParamData) | undefined;
  if (!item) {
    return { param: { decision: 'dismiss' } };
  }
  const reason = String(item.reason || '').trim();
  const data = mode === 'form' && isObjectRecord(item.form) ? { ...item.form } : undefined;
  return {
    param: {
      decision: item.decision,
      ...(reason ? { reason } : {}),
      ...(mode === 'form' && (data || item.decision === 'approve') ? { data: data ?? {} } : {}),
    },
  };
}

export function isAwaitingFrameCloseMessage(value: unknown): boolean {
  return isObjectRecord(value)
    && (value.type === 'close' || value.type === 'done');
}
