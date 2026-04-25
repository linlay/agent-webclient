import type {
  ActiveAwaiting,
  AIAwaitApprovalSubmitParamData,
  AIAwaitFormSubmitParamData,
  AIAwaitMode,
  AIAwaitQuestionSubmitParamData,
  AIAwaitSubmitParamData,
  AIAwaitSubmitPayloadData,
  FormActiveAwaiting,
} from '@/app/state/types';

export type AwaitingRenderMode = 'none' | 'builtin' | 'html';
export type AwaitingCollectDecision = 'submit' | 'reject';

export interface AwaitingViewportData {
  runId: string;
  awaitingId: string;
  viewportKey: string;
  mode: 'form';
  timeout: number | null;
  activeFormIndex: number;
  activeFormId: string;
  forms: FormActiveAwaiting['forms'];
  form: Record<string, unknown> | null;
}

export interface AwaitingViewportMessage {
  type: 'awaiting_init' | 'awaiting_update';
  data: AwaitingViewportData;
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
  return mode === 'question' || mode === 'approval';
}

type LegacyAwaitingForm = FormActiveAwaiting['forms'][number] & {
  initialPayload?: Record<string, unknown> | null;
};

function cloneFormData(
  form: LegacyAwaitingForm | undefined,
): Record<string, unknown> | null {
  const formData = form?.form ?? form?.initialPayload;
  return formData ? { ...formData } : null;
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

  if (awaiting.mode === 'form' && awaiting.viewportKey.trim()) {
    return 'html';
  }

  if (isModeWithBuiltinDialog(awaiting.mode)) {
    return 'builtin';
  }

  if ('viewportType' in awaiting && awaiting.viewportType && awaiting.viewportKey.trim()) {
    return 'html';
  }

  if ('questions' in awaiting || 'approvals' in awaiting) {
    return 'builtin';
  }

  return 'none';
}

export function buildAwaitingViewportData(
  awaiting: FormActiveAwaiting,
  activeFormIndex = 0,
): AwaitingViewportData {
  const forms = awaiting.forms ?? [];
  const resolvedActiveFormIndex = clampActiveFormIndex(activeFormIndex, forms);
  const activeForm = forms[resolvedActiveFormIndex];
  return {
    runId: awaiting.runId,
    awaitingId: awaiting.awaitingId,
    viewportKey: awaiting.viewportKey,
    mode: 'form',
    timeout: awaiting.timeout,
    activeFormIndex: resolvedActiveFormIndex,
    activeFormId: activeForm?.id ?? '',
    forms: forms.map((form) => ({
      id: form.id,
      action: form.action,
      title: form.title,
      form: cloneFormData(form),
    })),
    form: cloneFormData(activeForm),
  };
}

export function buildAwaitingViewportSignature(
  awaiting: FormActiveAwaiting,
  activeFormIndex = 0,
): string {
  return JSON.stringify(buildAwaitingViewportData(awaiting, activeFormIndex));
}

export function buildAwaitingInitMessage(
  awaiting: FormActiveAwaiting,
  activeFormIndex = 0,
): AwaitingViewportMessage {
  return {
    type: 'awaiting_init',
    data: buildAwaitingViewportData(awaiting, activeFormIndex),
  };
}

export function buildAwaitingUpdateMessage(
  awaiting: FormActiveAwaiting,
  activeFormIndex = 0,
): AwaitingViewportMessage {
  return {
    type: 'awaiting_update',
    data: buildAwaitingViewportData(awaiting, activeFormIndex),
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
    && decision !== 'approve_prefix_run'
    && decision !== 'approve_always'
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
  const action = String(item.action || '').trim();
  if (!id) {
    return null;
  }
  if (action !== 'submit' && action !== 'reject' && action !== 'cancel') {
    return null;
  }

  if (action === 'submit') {
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
      action,
      form,
    };
  }

  return {
    id,
    action,
  };
}

export function normalizeAwaitingSubmitParams(
  value: unknown,
  mode?: AIAwaitMode,
): AIAwaitSubmitParamData[] {
  if (!Array.isArray(value)) {
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
      return (
        normalizeApprovalSubmitParam(item)
        ?? normalizeFormSubmitParam(item)
        ?? normalizeQuestionSubmitParam(item)
      );
    })
    .filter((item): item is AIAwaitSubmitParamData => Boolean(item));
}

export function readAwaitingSubmitPayload(
  value: unknown,
  awaiting: ActiveAwaiting,
): AIAwaitSubmitPayloadData | null {
  if (!isObjectRecord(value) || value.type !== 'frontend_awaiting_submit') {
    return null;
  }
  if (awaiting.mode !== 'form') {
    return null;
  }

  if (!Array.isArray(value.params)) {
    return null;
  }
  const params = normalizeAwaitingSubmitParams(value.params, 'form');
  if (params.length !== value.params.length) {
    return null;
  }
  return {
    runId: awaiting.runId,
    awaitingId: awaiting.awaitingId,
    params,
  };
}

export function isAwaitingFrameCloseMessage(value: unknown): boolean {
  return isObjectRecord(value)
    && (value.type === 'close' || value.type === 'done');
}
