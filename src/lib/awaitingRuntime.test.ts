import { ViewportTypeEnum } from '../context/types';
import { reduceActiveAwaiting } from './awaitingRuntime';

describe('reduceActiveAwaiting', () => {
  it('hydrates builtin confirm dialogs directly from awaiting.ask questions when provided', () => {
    const asked = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      viewportType: ViewportTypeEnum.Builtin,
      viewportKey: 'confirm_dialog',
      timeout: 60,
      questions: [
        {
          type: 'select',
          question: '继续执行吗？',
          options: [
            {
              label: '继续',
              description: '允许继续执行',
              value: 'continue',
            },
          ],
        },
      ],
    });

    expect(asked).toMatchObject({
      key: 'run_1#await_1',
      runId: 'run_1',
      awaitingId: 'await_1',
      viewportType: ViewportTypeEnum.Builtin,
      viewportKey: 'confirm_dialog',
      timeout: 60,
    });
    expect(asked?.questions).toHaveLength(1);
    expect(asked?.questions[0]).toMatchObject({
      question: '继续执行吗？',
    });
  });

  it('opens builtin confirm dialogs on awaiting.ask and hydrates questions on awaiting.payload', () => {
    const asked = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      viewportType: ViewportTypeEnum.Builtin,
      viewportKey: 'confirm_dialog',
      timeout: 60,
    });

    const hydrated = reduceActiveAwaiting(asked, {
      type: 'awaiting.payload',
      awaitingId: 'await_1',
      questions: [
        {
          type: 'select',
          question: '继续执行吗？',
          options: [
            {
              label: '继续',
              description: '允许继续执行',
              value: 'continue',
            },
          ],
        },
      ],
    });

    expect(asked).toMatchObject({
      key: 'run_1#await_1',
      runId: 'run_1',
      awaitingId: 'await_1',
      viewportType: ViewportTypeEnum.Builtin,
      viewportKey: 'confirm_dialog',
      timeout: 60,
      questions: [],
    });
    expect(hydrated?.questions).toHaveLength(1);
    expect(hydrated?.questions[0]).toMatchObject({
      question: '继续执行吗？',
    });
  });

  it('falls back to toolTimeout when awaiting.ask omits timeout', () => {
    const asked = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      viewportType: ViewportTypeEnum.Builtin,
      viewportKey: 'confirm_dialog',
      toolTimeout: 120000,
    });

    expect(asked?.timeout).toBe(120000);
  });

  it('prefers timeout over toolTimeout when both are present', () => {
    const asked = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      viewportType: ViewportTypeEnum.Builtin,
      viewportKey: 'confirm_dialog',
      timeout: 60,
      toolTimeout: 120000,
    });

    expect(asked?.timeout).toBe(60);
  });

  it('ignores payloads that do not match the active awaiting id', () => {
    const current = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      viewportType: ViewportTypeEnum.Builtin,
      viewportKey: 'confirm_dialog',
    });

    const next = reduceActiveAwaiting(current, {
      type: 'awaiting.payload',
      awaitingId: 'await_2',
      questions: [
        {
          type: 'select',
          question: 'bad',
          options: [],
        },
      ],
    });

    expect(next).toEqual(current);
  });

  it('clears awaiting state when the run reaches a terminal event', () => {
    const current = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      viewportType: ViewportTypeEnum.Builtin,
      viewportKey: 'confirm_dialog',
    });

    const next = reduceActiveAwaiting(current, {
      type: 'run.complete',
      runId: 'run_1',
    });

    expect(next).toBeNull();
  });
});
