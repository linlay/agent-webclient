import type {
  ActiveAwaiting,
  AIAwaitSubmitParamData,
  AIAwaitSubmitPayloadData,
} from '../../context/types';
import { ViewportTypeEnum } from '../../context/types';

export type AwaitingRenderMode = 'none' | 'builtin' | 'html';

export interface AwaitingViewportData {
  runId: string;
  awaitingId: string;
  viewportKey: string;
  viewportType: ActiveAwaiting['viewportType'];
  timeout: number | null;
  questions: ActiveAwaiting['questions'];
}

export interface AwaitingViewportMessage {
  type: 'awaiting_init' | 'awaiting_update';
  data: AwaitingViewportData;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function getAwaitingRenderMode(
  awaiting: ActiveAwaiting | null,
): AwaitingRenderMode {
  if (!awaiting) {
    return 'none';
  }

  if (
    awaiting.viewportType === ViewportTypeEnum.Html
    && awaiting.viewportKey.trim()
  ) {
    return 'html';
  }

  if (awaiting.viewportType === ViewportTypeEnum.Builtin) {
    return 'builtin';
  }

  return 'none';
}

export function buildAwaitingViewportData(
  awaiting: ActiveAwaiting,
): AwaitingViewportData {
  return {
    runId: awaiting.runId,
    awaitingId: awaiting.awaitingId,
    viewportKey: awaiting.viewportKey,
    viewportType: awaiting.viewportType,
    timeout: awaiting.timeout,
    questions: awaiting.questions,
  };
}

export function buildAwaitingViewportSignature(
  awaiting: ActiveAwaiting,
): string {
  return JSON.stringify(buildAwaitingViewportData(awaiting));
}

export function buildAwaitingInitMessage(
  awaiting: ActiveAwaiting,
): AwaitingViewportMessage {
  return {
    type: 'awaiting_init',
    data: buildAwaitingViewportData(awaiting),
  };
}

export function buildAwaitingUpdateMessage(
  awaiting: ActiveAwaiting,
): AwaitingViewportMessage {
  return {
    type: 'awaiting_update',
    data: buildAwaitingViewportData(awaiting),
  };
}

export function normalizeAwaitingSubmitParams(
  value: unknown,
): AIAwaitSubmitParamData[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => isObjectRecord(item))
    .map((item) => {
      const question = String(item.question || '').trim();
      const header = String(item.header || '').trim();
      const answerValue = item.answer;
      const answersValue = item.answers;
      const normalized: AIAwaitSubmitParamData = {
        question,
      };

      if (header) {
        normalized.header = header;
      }
      if (typeof answerValue === 'string' || typeof answerValue === 'number') {
        normalized.answer = answerValue;
      }
      if (Array.isArray(answersValue)) {
        normalized.answers = answersValue
          .map((entry) => String(entry || '').trim())
          .filter(Boolean);
      }

      return normalized;
    })
    .filter((item) => Boolean(item.question));
}

export function readAwaitingSubmitPayload(
  value: unknown,
  awaiting: ActiveAwaiting,
): AIAwaitSubmitPayloadData | null {
  if (!isObjectRecord(value) || value.type !== 'frontend_awaiting_submit') {
    return null;
  }

  const params = normalizeAwaitingSubmitParams(value.params);
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
