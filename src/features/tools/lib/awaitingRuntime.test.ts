import { ViewportTypeEnum } from '@/app/state/types';
import { reduceActiveAwaiting } from '@/features/tools/lib/awaitingRuntime';
import {
  clearAllAwaitingQuestionMeta,
  getAwaitingQuestionMeta,
} from '@/features/tools/lib/awaitingQuestionMeta';

describe('reduceActiveAwaiting', () => {
  beforeEach(() => {
    clearAllAwaitingQuestionMeta();
  });

  it('opens question awaitings directly from awaiting.ask.questions without viewport metadata', () => {
    const asked = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      mode: 'question',
      timeout: 60,
      questions: [
        {
          id: 'q1',
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
      mode: 'question',
      timeout: 60,
    });
    expect(asked?.mode).toBe('question');
    expect(asked?.questions).toHaveLength(1);
    expect(asked?.questions[0]).toMatchObject({
      id: 'q1',
      question: '继续执行吗？',
    });
  });

  it('normalizes multiple select questions and ignores legacy multiSelect', () => {
    const asked = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_multi_1',
      awaitingId: 'await_multi_1',
      mode: 'question',
      questions: [
        {
          id: 'q1',
          type: 'select',
          question: '请选择环境',
          multiple: true,
          multiSelect: true,
          options: [
            { label: 'dev' },
            { label: 'prod' },
          ],
        },
      ],
    } as any);

    expect(asked?.questions[0]).toMatchObject({
      id: 'q1',
      type: 'select',
      question: '请选择环境',
      multiple: true,
    });
    expect('multiSelect' in (asked?.questions[0] ?? {})).toBe(false);
  });

  it('keeps legacy question awaitings compatible when awaiting.ask omits mode', () => {
    const asked = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_legacy_1',
      awaitingId: 'await_legacy_1',
      timeout: 60,
      questions: [
        {
          type: 'select',
          question: '您希望我演示哪种提问式确认场景？',
          options: [
            {
              label: '通用确认',
              description: '日常事务确认',
            },
          ],
        },
      ],
    });

    expect(asked).toMatchObject({
      key: 'run_legacy_1#await_legacy_1',
      runId: 'run_legacy_1',
      awaitingId: 'await_legacy_1',
      mode: 'question',
      timeout: 60,
    });
    expect(asked?.questions[0]).toMatchObject({
      id: '您希望我演示哪种提问式确认场景？',
    });
  });

  it('hydrates legacy question awaitings from awaiting.payload only for replay compatibility', () => {
    const asked = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_legacy_2',
      awaitingId: 'await_legacy_2',
      timeout: 120000,
    });

    const hydrated = reduceActiveAwaiting(asked, {
      type: 'awaiting.payload',
      awaitingId: 'await_legacy_2',
      questions: [
        {
          type: 'select',
          question: '您希望我演示哪种提问式确认场景？',
          options: [
            {
              label: '请假流程提问',
              description: '演示请假申请所需字段收集',
            },
          ],
        },
      ],
    });

    expect(asked).toMatchObject({
      key: 'run_legacy_2#await_legacy_2',
      mode: 'question',
      timeout: 120000,
      questions: [],
    });
    expect(hydrated?.questions).toHaveLength(1);
    expect(hydrated?.questions[0]).toMatchObject({
      id: '您希望我演示哪种提问式确认场景？',
    });
  });

  it('keeps text, number and password question fields and assigns fallback ids when missing', () => {
    const asked = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_2',
      awaitingId: 'await_2',
      mode: 'question',
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
        id: '请输入仓库地址',
        type: 'text',
        header: '仓库地址',
        question: '请输入仓库地址',
        placeholder: 'https://...',
      },
      {
        id: '请输入端口',
        type: 'number',
        question: '请输入端口',
        placeholder: '8080',
        header: undefined,
      },
      {
        id: '请输入令牌',
        type: 'password',
        question: '请输入令牌',
        placeholder: 'sk-...',
        header: undefined,
      },
    ]);
  });

  it('registers question metadata for later answer masking by id', () => {
    reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_3',
      awaitingId: 'await_3',
      mode: 'question',
      questions: [
        {
          id: 'db_password',
          type: 'password',
          header: '数据库密码',
          question: '请输入数据库密码',
          placeholder: '******',
        },
      ],
    });

    expect(
      getAwaitingQuestionMeta('run_3', 'await_3', 'db_password'),
    ).toMatchObject({
      type: 'password',
      header: '数据库密码',
    });
  });

  it('opens approval awaitings without viewport metadata', () => {
    const asked = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_4',
      awaitingId: 'await_4',
      mode: 'approval',
      timeout: 120,
      approvals: [
        {
          id: 'approve_1',
          command: '删除生产环境缓存',
          ruleKey: 'dangerous-commands::redis::flushall::1::builtin::confirm_dialog',
          description: '清理线上 Redis 缓存',
          options: [
            { label: '同意', decision: 'approve' },
            { label: '同意（本次运行同前缀都放行）', decision: 'approve_prefix_run' },
            { label: '拒绝', decision: 'reject' },
          ],
          allowFreeText: true,
          freeTextPlaceholder: '可选：填写理由',
        },
      ],
    });

    expect(asked).toMatchObject({
      key: 'run_4#await_4',
      runId: 'run_4',
      awaitingId: 'await_4',
      timeout: 120,
      mode: 'approval',
    });
    expect(asked?.mode).toBe('approval');
    expect(asked?.approvals).toEqual([
      {
        id: 'approve_1',
        command: '删除生产环境缓存',
        ruleKey: 'dangerous-commands::redis::flushall::1::builtin::confirm_dialog',
        description: '清理线上 Redis 缓存',
        options: [
          { label: '同意', decision: 'approve' },
          { label: '同意（本次运行同前缀都放行）', decision: 'approve_prefix_run' },
          { label: '拒绝', decision: 'reject' },
        ],
        allowFreeText: true,
        freeTextPlaceholder: '可选：填写理由',
      },
    ]);
  });

  it('opens form awaitings only for html viewports and preserves html runtime state on repeated asks', () => {
    const current = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_5',
      awaitingId: 'await_5',
      viewportType: ViewportTypeEnum.Html,
      viewportKey: 'expense_form',
      mode: 'form',
      forms: [
        {
          id: 'expense_form',
          action: '提交报销单',
          title: '报销申请',
          payload: {
            amount: 800,
          },
        },
      ],
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
      mode: 'form',
    });

    expect(next).toMatchObject({
      mode: 'form',
      viewportType: ViewportTypeEnum.Html,
      viewportKey: 'expense_form',
    });
    if (next?.mode !== 'form') {
      throw new Error('expected form awaiting');
    }
    expect(next.viewportHtml).toBe('<html><body>ok</body></html>');
    expect(next.loading).toBe(false);
    expect(next.loadError).toBe('');
    expect(next.forms).toEqual([
      {
        id: 'expense_form',
        action: '提交报销单',
        title: '报销申请',
        payload: {
          amount: 800,
        },
      },
    ]);
  });

  it('keeps legacy initialPayload form events compatible for replay', () => {
    const current = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_legacy_form',
      awaitingId: 'await_legacy_form',
      viewportType: ViewportTypeEnum.Html,
      viewportKey: 'leave_form',
      mode: 'form',
      forms: [
        {
          id: 'leave_form',
          action: '提交请假申请',
          title: 'mock 请假申请',
          initialPayload: {
            applicant_id: 'E1001',
          },
        },
      ],
    } as any);

    expect(current).toMatchObject({
      mode: 'form',
      viewportKey: 'leave_form',
    });
    expect(current?.mode).toBe('form');
    if (current?.mode !== 'form') {
      throw new Error('expected form awaiting');
    }
    expect(current.forms).toEqual([
      {
        id: 'leave_form',
        action: '提交请假申请',
        title: 'mock 请假申请',
        payload: {
          applicant_id: 'E1001',
        },
      },
    ]);
  });

  it('rejects form awaitings without html viewport metadata', () => {
    const current = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_6',
      awaitingId: 'await_6',
      mode: 'form',
      forms: [
        {
          id: 'leave_form',
          action: '提交请假申请',
        },
      ],
    });

    expect(current).toBeNull();
  });

  it('keeps legacy html awaiting compatible by treating it as form', () => {
    const asked = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_7',
      awaitingId: 'await_7',
      viewportType: ViewportTypeEnum.Html,
      viewportKey: 'leave_form',
      payload: {
        applicant_id: 'E1001',
      },
    });

    expect(asked).toMatchObject({
      key: 'run_7#await_7',
      mode: 'form',
    });
    expect(asked?.mode).toBe('form');
  });

  it('falls back to toolTimeout when awaiting.ask omits timeout', () => {
    const asked = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      mode: 'question',
      toolTimeout: 120000,
    });

    expect(asked?.timeout).toBe(120000);
  });

  it('prefers timeout over toolTimeout when both are present', () => {
    const asked = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      mode: 'question',
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
      mode: 'question',
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

  it('marks awaiting as resolved when awaiting.answer matches the active dialog', () => {
    const current = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      mode: 'approval',
      approvals: [
        {
          id: 'approve_1',
          command: '删除生产环境缓存',
          ruleKey: 'dangerous-commands::redis::flushall::1::builtin::confirm_dialog',
        },
      ],
    });

    const next = reduceActiveAwaiting(current, {
      type: 'awaiting.answer',
      runId: 'run_1',
      awaitingId: 'await_1',
      status: 'answered',
      approvals: [
        {
          id: 'approve_1',
          decision: 'approve',
        },
      ],
    });

    expect(next).toMatchObject({
      awaitingId: 'await_1',
      resolvedByOther: true,
    });
  });

  it('clears awaiting state when the run reaches a terminal event', () => {
    const current = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      mode: 'question',
      questions: [
        {
          id: 'continue',
          type: 'select',
          question: '继续执行吗？',
          options: [],
        },
      ],
    });

    const next = reduceActiveAwaiting(current, {
      type: 'run.complete',
      runId: 'run_1',
    });

    expect(next).toBeNull();
    expect(
      getAwaitingQuestionMeta('run_1', 'await_1', 'continue'),
    ).toBeNull();
  });
});
