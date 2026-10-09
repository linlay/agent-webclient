import { ViewRendererEnum } from "@/shared/contracts/agentEvents";
import type { ActiveAwaiting, FormActiveAwaiting } from "@/features/tools/lib/toolsState";
import {
  buildAwaitingCollectMessage,
  buildAwaitingInitMessage,
  buildAwaitingUpdateMessage,
  getAwaitingRenderMode,
  isAwaitingFrameCloseMessage,
  normalizeAwaitingSubmitParams,
  readAwaitingSubmitPayload,
  toWireAwaitingSubmit,
} from '@/features/tools/lib/protocol';

function createQuestionAwaiting(
  patch: Partial<Extract<ActiveAwaiting, { mode: 'question' }>> = {},
): Extract<ActiveAwaiting, { mode: 'question' }> {
  return {
    key: 'run_1#await_1',
    awaitingId: 'await_1',
    runId: 'run_1',
    agentKey: 'demo-agent',
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
    agentKey: 'demo-agent',
    timeout: 60,
    mode: 'form',
    forms: [
      {
        id: 'leave_form',
        action: '提交请假申请',
        title: 'mock 请假申请',
        form: {
          applicant_id: 'E1001',
        },
      },
    ],
    viewKey: 'leave_form',
    viewRenderer: ViewRendererEnum.Html,
    loading: false,
    loadError: '',
    viewHtml: '<html><body>ok</body></html>',
    ...patch,
  };
}

function createPlanAwaiting(
  patch: Partial<Extract<ActiveAwaiting, { mode: 'plan' }>> = {},
): Extract<ActiveAwaiting, { mode: 'plan' }> {
  return {
    key: 'run_1#await_plan_1',
    awaitingId: 'await_plan_1',
    runId: 'run_1',
    agentKey: 'demo-agent',
    timeout: 0,
    mode: 'plan',
    plan: {
      id: 'confirm',
      planningId: 'run_1_planning_1',
      title: '实施此计划？',
    },
    ...patch,
  };
}

describe('awaiting protocol helpers', () => {
  it('selects builtin and html render modes from awaiting mode', () => {
    expect(getAwaitingRenderMode(null)).toBe('none');
    expect(getAwaitingRenderMode(createQuestionAwaiting())).toBe('builtin');
    expect(getAwaitingRenderMode(createPlanAwaiting())).toBe('builtin');
    expect(getAwaitingRenderMode(createFormAwaiting())).toBe('html');
  });

  it('builds awaiting init and update messages with one form of title and data', () => {
    const awaiting = createFormAwaiting();

    expect(buildAwaitingInitMessage(awaiting)).toEqual({
      type: 'awaiting_init',
      data: {
        runId: 'run_1',
        awaitingId: 'await_1',
        mode: 'form',
        timeout: 60,
        form: {
          title: 'mock 请假申请',
          data: { applicant_id: 'E1001' },
        },
      },
    });
    expect(buildAwaitingUpdateMessage(awaiting).type).toBe('awaiting_update');
    const data = buildAwaitingInitMessage(awaiting).data as unknown as Record<string, unknown>;
    expect(data.forms).toBeUndefined();
    expect(data.activeFormId).toBeUndefined();
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
        decision: 'approve_rule_run',
        reason: '缺少说明',
      },
    ], 'approval')).toEqual([
      {
        id: 'a1',
        decision: 'approve_rule_run',
        reason: '缺少说明',
      },
    ]);

    expect(normalizeAwaitingSubmitParams([
      {
        id: 'confirm',
        decision: 'reject',
        reason: '请补充测试范围',
        planningId: 'run_1_planning_1',
      },
    ], 'plan')).toEqual([
      {
        id: 'confirm',
        decision: 'reject',
        reason: '请补充测试范围',
        planningId: 'run_1_planning_1',
      },
    ]);

    expect(normalizeAwaitingSubmitParams([
      {
        id: 'f1',
        decision: 'approve',
        form: {
          amount: 80,
        },
      },
      {
        id: 'f2',
        decision: 'reject',
      },
      {
        id: 'f3',
        decision: 'reject',
        reason: '缺少说明',
        form: {
          amount: 90,
        },
      },
    ], 'form')).toEqual([
      {
        id: 'f1',
        decision: 'approve',
        form: {
          amount: 80,
        },
      },
      {
        id: 'f2',
        decision: 'reject',
      },
      {
        id: 'f3',
        decision: 'reject',
        reason: '缺少说明',
        form: {
          amount: 90,
        },
      },
    ]);
  });

  it('rejects malformed plan submit params', () => {
    expect(normalizeAwaitingSubmitParams([
      {
        id: 'confirm',
        decision: 'approve_rule_run',
      },
    ], 'plan')).toEqual([]);
    expect(normalizeAwaitingSubmitParams([
      {
        id: 'confirm',
        decision: 'approve',
      },
      {
        id: 'confirm',
        decision: 'reject',
      },
    ], 'plan')).toEqual([]);
    expect(normalizeAwaitingSubmitParams([
      {
        id: 'confirm',
        decision: 'approve',
        form: {},
      },
    ], 'plan')).toEqual([]);
  });

  it('reads a single frontend awaiting param for form awaitings', () => {
    const awaiting = createFormAwaiting();

    expect(readAwaitingSubmitPayload({
      type: 'frontend_awaiting_submit',
      param: { decision: 'approve', data: { approved: true } },
    }, awaiting)).toEqual({
      runId: 'run_1',
      awaitingId: 'await_1',
      params: [{ id: 'leave_form', decision: 'approve', form: { approved: true } }],
    });
    expect(readAwaitingSubmitPayload({
      type: 'frontend_awaiting_submit',
      param: { decision: 'reject', reason: 'no', data: { approved: false } },
    }, awaiting)).toEqual({
      runId: 'run_1',
      awaitingId: 'await_1',
      params: [{ id: 'leave_form', decision: 'reject', reason: 'no', form: { approved: false } }],
    });
  });

  it('rejects malformed frontend awaiting submit payloads for forms', () => {
    const awaiting = createFormAwaiting();
    for (const message of [
      { type: 'frontend_awaiting_submit', param: { decision: 'approve', data: 'bad' } },
      { type: 'frontend_awaiting_submit', param: { decision: 'approve' } },
      { type: 'frontend_awaiting_submit', param: { decision: 'dismiss' } },
      { type: 'frontend_awaiting_submit', params: [{ id: 'leave_form', decision: 'approve', form: {} }] },
    ]) {
      expect(readAwaitingSubmitPayload(message, awaiting)).toBeNull();
    }
  });

  it('converts planning and form answers to one wire param and keeps lists for the rest', () => {
    expect(toWireAwaitingSubmit('form', [{ id: 'leave_form', decision: 'approve', form: { days: 2 } }]))
      .toEqual({ param: { decision: 'approve', data: { days: 2 } } });
    expect(toWireAwaitingSubmit('form', [{ id: 'leave_form', decision: 'reject', reason: ' no ', form: { days: 1 } }]))
      .toEqual({ param: { decision: 'reject', reason: 'no', data: { days: 1 } } });
    expect(toWireAwaitingSubmit('form', [{ id: 'leave_form', decision: 'reject' }]))
      .toEqual({ param: { decision: 'reject' } });
    expect(toWireAwaitingSubmit('form', [])).toEqual({ param: { decision: 'dismiss' } });
    expect(toWireAwaitingSubmit('plan', [{ id: 'confirm', planningId: 'p1', decision: 'reject', reason: 'more tests' }]))
      .toEqual({ param: { decision: 'reject', reason: 'more tests' } });
    expect(toWireAwaitingSubmit('plan', [])).toEqual({ param: { decision: 'dismiss' } });
    const answers = [{ id: 'q1', answer: 'ok' }];
    expect(toWireAwaitingSubmit('question', answers)).toEqual({ params: answers });
    expect(toWireAwaitingSubmit('approval', [])).toEqual({ params: [] });
  });

  it('treats close and done as iframe close signals', () => {
    expect(isAwaitingFrameCloseMessage({ type: 'close' })).toBe(true);
    expect(isAwaitingFrameCloseMessage({ type: 'done' })).toBe(true);
    expect(isAwaitingFrameCloseMessage({ type: 'noop' })).toBe(false);
  });
});
