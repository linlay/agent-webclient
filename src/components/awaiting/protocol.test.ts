import { ViewportTypeEnum } from '../../context/types';
import type { ActiveAwaiting } from '../../context/types';
import {
  buildAwaitingInitMessage,
  buildAwaitingUpdateMessage,
  getAwaitingRenderMode,
  isAwaitingFrameCloseMessage,
  normalizeAwaitingSubmitParams,
  readAwaitingSubmitPayload,
} from './protocol';

function createActiveAwaiting(
  patch: Partial<ActiveAwaiting> = {},
): ActiveAwaiting {
  return {
    key: 'run_1#await_1',
    awaitingId: 'await_1',
    runId: 'run_1',
    timeout: 60,
    viewportKey: 'confirm_dialog',
    viewportType: ViewportTypeEnum.Builtin,
    questions: [],
    loading: false,
    loadError: '',
    viewportHtml: '',
    ...patch,
  };
}

describe('awaiting protocol helpers', () => {
  it('selects builtin and html render modes from viewport type', () => {
    expect(getAwaitingRenderMode(null)).toBe('none');
    expect(getAwaitingRenderMode(createActiveAwaiting())).toBe('builtin');
    expect(
      getAwaitingRenderMode(createActiveAwaiting({
        viewportType: ViewportTypeEnum.Html,
        viewportKey: 'leave_form',
      })),
    ).toBe('html');
  });

  it('builds awaiting init and update messages from active awaiting state', () => {
    const awaiting = createActiveAwaiting({
      viewportType: ViewportTypeEnum.Html,
      viewportKey: 'leave_form',
      questions: [
        {
          type: 'text',
          question: '请确认请假原因',
        },
      ],
    });

    expect(buildAwaitingInitMessage(awaiting)).toEqual({
      type: 'awaiting_init',
      data: {
        runId: 'run_1',
        awaitingId: 'await_1',
        viewportKey: 'leave_form',
        viewportType: ViewportTypeEnum.Html,
        timeout: 60,
        questions: [
          {
            type: 'text',
            question: '请确认请假原因',
          },
        ],
      },
    });
    expect(buildAwaitingUpdateMessage(awaiting).type).toBe('awaiting_update');
  });

  it('normalizes iframe submit params and preserves string/number answers', () => {
    expect(normalizeAwaitingSubmitParams([
      {
        header: '审批意见',
        question: '是否批准？',
        answer: 'approve',
        answers: ['approve', '', 'keep'],
      },
      {
        question: '天数',
        answer: 3,
      },
      {
        answer: 'missing-question',
      },
    ])).toEqual([
      {
        header: '审批意见',
        question: '是否批准？',
        answer: 'approve',
        answers: ['approve', 'keep'],
      },
      {
        question: '天数',
        answer: 3,
      },
    ]);
  });

  it('reads frontend awaiting submit payloads using the active awaiting identifiers', () => {
    const awaiting = createActiveAwaiting({
      viewportType: ViewportTypeEnum.Html,
      viewportKey: 'leave_form',
    });

    expect(readAwaitingSubmitPayload({
      type: 'frontend_awaiting_submit',
      params: [
        {
          question: '是否批准？',
          answer: 'approve',
        },
      ],
    }, awaiting)).toEqual({
      runId: 'run_1',
      awaitingId: 'await_1',
      params: [
        {
          question: '是否批准？',
          answer: 'approve',
        },
      ],
    });
  });

  it('treats close and done as iframe close signals', () => {
    expect(isAwaitingFrameCloseMessage({ type: 'close' })).toBe(true);
    expect(isAwaitingFrameCloseMessage({ type: 'done' })).toBe(true);
    expect(isAwaitingFrameCloseMessage({ type: 'noop' })).toBe(false);
  });
});
