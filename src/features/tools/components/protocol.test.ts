import { ViewportTypeEnum } from '@/app/state/types';
import type {
  ActiveAwaiting,
  FormActiveAwaiting,
} from '@/app/state/types';
import {
  buildAwaitingCollectMessage,
  buildAwaitingInitMessage,
  buildAwaitingUpdateMessage,
  getAwaitingRenderMode,
  isAwaitingFrameCloseMessage,
  normalizeAwaitingSubmitParams,
  readAwaitingSubmitPayload,
} from '@/features/tools/components/protocol';

function createQuestionAwaiting(
  patch: Partial<Extract<ActiveAwaiting, { mode: 'question' }>> = {},
): Extract<ActiveAwaiting, { mode: 'question' }> {
  return {
    key: 'run_1#await_1',
    awaitingId: 'await_1',
    runId: 'run_1',
    timeout: 60,
    mode: 'question',
    questions: [],
    ...patch,
  };
}

function createFormAwaiting(
  patch: Partial<FormActiveAwaiting> = {},
): FormActiveAwaiting {
  return {
    key: 'run_1#await_1',
    awaitingId: 'await_1',
    runId: 'run_1',
    timeout: 60,
    mode: 'form',
    forms: [
      {
        id: 'leave_form',
        action: '提交请假申请',
        title: 'mock 请假申请',
        payload: {
          applicant_id: 'E1001',
        },
      },
    ],
    viewportKey: 'leave_form',
    viewportType: ViewportTypeEnum.Html,
    loading: false,
    loadError: '',
    viewportHtml: '<html><body>ok</body></html>',
    ...patch,
  };
}

describe('awaiting protocol helpers', () => {
  it('selects builtin and html render modes from awaiting mode', () => {
    expect(getAwaitingRenderMode(null)).toBe('none');
    expect(getAwaitingRenderMode(createQuestionAwaiting())).toBe('builtin');
    expect(getAwaitingRenderMode(createFormAwaiting())).toBe('html');
  });

  it('builds awaiting init and update messages from form awaiting state', () => {
    const awaiting = createFormAwaiting();

    expect(buildAwaitingInitMessage(awaiting)).toEqual({
      type: 'awaiting_init',
      data: {
        runId: 'run_1',
        awaitingId: 'await_1',
        viewportKey: 'leave_form',
        mode: 'form',
        timeout: 60,
        forms: [
          {
            id: 'leave_form',
            action: '提交请假申请',
            title: 'mock 请假申请',
            payload: {
              applicant_id: 'E1001',
            },
          },
        ],
        payload: {
          applicant_id: 'E1001',
        },
      },
    });
    expect(buildAwaitingUpdateMessage(awaiting).type).toBe('awaiting_update');
  });

  it('keeps legacy initialPayload compatible when building iframe init data', () => {
    const awaiting = createFormAwaiting({
      forms: [
        {
          id: 'leave_form',
          action: '提交请假申请',
          title: 'mock 请假申请',
        } as FormActiveAwaiting['forms'][number],
      ],
    });
    (awaiting.forms[0] as FormActiveAwaiting['forms'][number] & {
      initialPayload?: Record<string, unknown> | null;
    }).initialPayload = { applicant_id: 'E1001' };

    expect(buildAwaitingInitMessage(awaiting)).toEqual({
      type: 'awaiting_init',
      data: {
        runId: 'run_1',
        awaitingId: 'await_1',
        viewportKey: 'leave_form',
        mode: 'form',
        timeout: 60,
        forms: [
          {
            id: 'leave_form',
            action: '提交请假申请',
            title: 'mock 请假申请',
            payload: {
              applicant_id: 'E1001',
            },
          },
        ],
        payload: {
          applicant_id: 'E1001',
        },
      },
    });
  });

  it('builds collect messages with run id, awaiting id and decision', () => {
    const awaiting = createFormAwaiting();

    expect(buildAwaitingCollectMessage(awaiting, 'submit')).toEqual({
      type: 'awaiting_collect',
      data: {
        runId: 'run_1',
        awaitingId: 'await_1',
        decision: 'submit',
      },
    });
  });

  it('normalizes union submit params by mode', () => {
    expect(normalizeAwaitingSubmitParams([
      {
        id: 'q1',
        answer: 'approve',
        answers: ['approve', '', 'keep'],
      },
      {
        id: 'q2',
        answer: 3,
      },
    ], 'question')).toEqual([
      {
        id: 'q1',
        answer: 'approve',
        answers: ['approve', 'keep'],
      },
      {
        id: 'q2',
        answer: 3,
      },
    ]);

    expect(normalizeAwaitingSubmitParams([
      {
        id: 'a1',
        decision: 'approve_prefix_run',
        reason: '缺少说明',
      },
    ], 'approval')).toEqual([
      {
        id: 'a1',
        decision: 'approve_prefix_run',
        reason: '缺少说明',
      },
    ]);

    expect(normalizeAwaitingSubmitParams([
      {
        id: 'f1',
        payload: {
          amount: 80,
        },
      },
      {
        id: 'f2',
        reason: '取消提交',
      },
    ], 'form')).toEqual([
      {
        id: 'f1',
        payload: {
          amount: 80,
        },
      },
      {
        id: 'f2',
        reason: '取消提交',
      },
    ]);
  });

  it('reads frontend awaiting submit payloads for form awaitings using active identifiers', () => {
    const awaiting = createFormAwaiting();

    expect(readAwaitingSubmitPayload({
      type: 'frontend_awaiting_submit',
      params: [
        {
          id: 'leave_form',
          payload: {
            approved: true,
          },
        },
      ],
    }, awaiting)).toEqual({
      runId: 'run_1',
      awaitingId: 'await_1',
      params: [
        {
          id: 'leave_form',
          payload: {
            approved: true,
          },
        },
      ],
    });
  });

  it('rejects malformed frontend awaiting submit payloads for forms', () => {
    const awaiting = createFormAwaiting();

    expect(readAwaitingSubmitPayload({
      type: 'frontend_awaiting_submit',
      params: [
        {
          id: 'leave_form',
          payload: 'bad',
        },
      ],
    }, awaiting)).toBeNull();
  });

  it('treats close and done as iframe close signals', () => {
    expect(isAwaitingFrameCloseMessage({ type: 'close' })).toBe(true);
    expect(isAwaitingFrameCloseMessage({ type: 'done' })).toBe(true);
    expect(isAwaitingFrameCloseMessage({ type: 'noop' })).toBe(false);
  });
});
