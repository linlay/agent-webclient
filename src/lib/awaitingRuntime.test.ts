import { ViewportTypeEnum } from '../context/types';
import { reduceActiveAwaiting } from './awaitingRuntime';
import {
  clearAllAwaitingQuestionMeta,
  getAwaitingQuestionMeta,
} from './awaitingQuestionMeta';

describe('reduceActiveAwaiting', () => {
  beforeEach(() => {
    clearAllAwaitingQuestionMeta();
  });

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
      loading: false,
      loadError: '',
      viewportHtml: '',
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
      loading: false,
      loadError: '',
      viewportHtml: '',
      questions: [],
    });
    expect(hydrated?.questions).toHaveLength(1);
    expect(hydrated?.questions[0]).toMatchObject({
      question: '继续执行吗？',
    });
  });

  it('keeps text, number and password question fields without requiring options', () => {
    const asked = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_2',
      awaitingId: 'await_2',
      viewportType: ViewportTypeEnum.Builtin,
      viewportKey: 'confirm_dialog',
      questions: [
        {
          type: 'text',
          header: '仓库地址',
          question: '请输入仓库地址',
          placeholder: 'https://...',
          options: [{ label: 'should be stripped' }],
        },
        {
          type: 'number',
          question: '请输入端口',
          placeholder: '8080',
        },
        {
          type: 'password',
          question: '请输入令牌',
          placeholder: 'sk-...',
        },
      ],
    });

    expect(asked?.questions).toEqual([
      {
        type: 'text',
        header: '仓库地址',
        question: '请输入仓库地址',
        placeholder: 'https://...',
      },
      {
        type: 'number',
        question: '请输入端口',
        placeholder: '8080',
      },
      {
        type: 'password',
        question: '请输入令牌',
        placeholder: 'sk-...',
      },
    ]);
  });

  it('registers question metadata for later answer masking', () => {
    reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_3',
      awaitingId: 'await_3',
      viewportType: ViewportTypeEnum.Builtin,
      viewportKey: 'confirm_dialog',
      questions: [
        {
          type: 'password',
          header: '数据库密码',
          question: '请输入数据库密码',
          placeholder: '******',
        },
      ],
    });

    expect(
      getAwaitingQuestionMeta('run_3', 'await_3', '请输入数据库密码'),
    ).toMatchObject({
      type: 'password',
      header: '数据库密码',
    });
  });

  it('opens html awaiting sessions for arbitrary viewport keys', () => {
    const asked = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_4',
      awaitingId: 'await_4',
      viewportType: ViewportTypeEnum.Html,
      viewportKey: 'leave_form',
      timeout: 120,
      questions: [
        {
          type: 'text',
          question: '请确认请假原因',
        },
      ],
    });

    expect(asked).toMatchObject({
      key: 'run_4#await_4',
      runId: 'run_4',
      awaitingId: 'await_4',
      viewportType: ViewportTypeEnum.Html,
      viewportKey: 'leave_form',
      timeout: 120,
      loading: false,
      loadError: '',
      viewportHtml: '',
    });
    expect(asked?.questions).toHaveLength(1);
  });

  it('preserves html viewport runtime state for repeated asks on the same awaiting key', () => {
    const current = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_5',
      awaitingId: 'await_5',
      viewportType: ViewportTypeEnum.Html,
      viewportKey: 'expense_form',
    });

    const hydrated = {
      ...current!,
      loading: false,
      loadError: '',
      viewportHtml: '<html><body>ok</body></html>',
    };

    const next = reduceActiveAwaiting(hydrated, {
      type: 'awaiting.ask',
      runId: 'run_5',
      awaitingId: 'await_5',
      viewportType: ViewportTypeEnum.Html,
      viewportKey: 'expense_form',
    });

    expect(next?.viewportHtml).toBe('<html><body>ok</body></html>');
    expect(next?.loading).toBe(false);
    expect(next?.loadError).toBe('');
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
    expect(
      getAwaitingQuestionMeta('run_1', 'await_1', '继续执行吗？'),
    ).toBeNull();
  });
});
