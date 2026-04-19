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
  forms: FormActiveAwaiting['forms'];
  initialPayload: Record<string, unknown> | null;
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
): AwaitingViewportData {
  const forms = awaiting.forms ?? [];
  return {
    runId: awaiting.runId,
    awaitingId: awaiting.awaitingId,
    viewportKey: awaiting.viewportKey,
    mode: 'form',
    timeout: awaiting.timeout,
    forms: forms.map((form) => ({
      ...form,
      initialPayload: form.initialPayload ? { ...form.initialPayload } : null,
    })),
    initialPayload: forms[0]?.initialPayload
      ? { ...forms[0].initialPayload }
      : null,
  };
}

export function buildAwaitingViewportSignature(
  awaiting: FormActiveAwaiting,
): string {
  return JSON.stringify(buildAwaitingViewportData(awaiting));
}

export function buildAwaitingInitMessage(
  awaiting: FormActiveAwaiting,
): AwaitingViewportMessage {
  return {
    type: 'awaiting_init',
    data: buildAwaitingViewportData(awaiting),
  };
}

export function buildAwaitingUpdateMessage(
  awaiting: FormActiveAwaiting,
): AwaitingViewportMessage {
  return {
    type: 'awaiting_update',
    data: buildAwaitingViewportData(awaiting),
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
  if (!id) {
    return null;
  }

  const payload = isObjectRecord(item.payload)
    ? { ...item.payload }
    : item.payload == null
    ? undefined
    : null;
  const reason = String(item.reason || '').trim() || undefined;
  if (payload === undefined && !reason) {
    return null;
  }

  return {
    id,
    ...(payload !== undefined ? { payload } : {}),
    ...(reason ? { reason } : {}),
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

  const params = normalizeAwaitingSubmitParams(value.params, 'form');
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
