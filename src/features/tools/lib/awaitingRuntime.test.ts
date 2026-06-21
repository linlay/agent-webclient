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
              previewHtml: '<div>继续预览</div>',
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
      options: [
        {
          label: '继续',
          description: '允许继续执行',
          previewHtml: '<div>继续预览</div>',
          value: 'continue',
        },
      ],
    });
  });

  it('inherits agentKey for awaiting.ask when the event omits it', () => {
    const asked = reduceActiveAwaiting(
      null,
      {
        type: 'awaiting.ask',
        runId: 'run_1',
        awaitingId: 'await_1',
        mode: 'question',
        questions: [
          {
            id: 'q1',
            type: 'select',
            question: '继续执行吗？',
          },
        ],
      },
      { agentKey: 'context-agent' },
    );

    expect(asked).toMatchObject({
      runId: 'run_1',
      awaitingId: 'await_1',
      agentKey: 'context-agent',
      mode: 'question',
    });
  });

  it('ignores push-only awaiting.asking so it does not overwrite stream awaiting data', () => {
    const current = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      mode: 'approval',
      approvals: [
        {
          id: 'approval_1',
          command: 'rm -rf /tmp/demo',
          description: '危险命令确认',
        },
      ],
    });

    const next = reduceActiveAwaiting(current, {
      type: 'awaiting.asking',
      runId: 'run_1',
      awaitingId: 'await_1',
      mode: 'approval',
    } as any);

    expect(next).toBe(current);
    expect(next).toMatchObject({
      runId: 'run_1',
      awaitingId: 'await_1',
      mode: 'approval',
      approvals: [
        {
          id: 'approval_1',
          command: 'rm -rf /tmp/demo',
        },
      ],
    });
  });

  it('normalizes multi-select questions without multiple flags', () => {
    const asked = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_multi_1',
      awaitingId: 'await_multi_1',
      mode: 'question',
      questions: [
        {
          id: 'q1',
          type: 'multi-select',
          question: '请选择环境',
          options: [
            { label: 'dev' },
            { label: 'prod' },
          ],
        },
      ],
    } as any);

    expect(asked?.questions[0]).toMatchObject({
      id: 'q1',
      type: 'multi-select',
      question: '请选择环境',
    });
    expect('multiple' in (asked?.questions[0] ?? {})).toBe(false);
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
            { label: '同意（本次运行同规则都放行）', decision: 'approve_rule_run' },
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
          { label: '同意（本次运行同规则都放行）', decision: 'approve_rule_run' },
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
          form: {
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
        form: {
          amount: 800,
        },
      },
    ]);
  });

  it('opens plan awaitings from a single plan object', () => {
    const asked = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_plan_1',
      awaitingId: 'run_plan_1_coder_plan_confirm_1',
      mode: 'plan',
      viewportType: ViewportTypeEnum.Builtin,
      viewportKey: 'plan',
      timeout: 0,
      plan: {
        id: 'confirm',
        planningId: 'run_plan_1_planning_1',
        title: '实施此计划？',
        options: [
          { label: '是，实施此计划', decision: 'approve' },
          {
            label: '否，请告知如何调整',
            decision: 'reject',
            input: {
              type: 'text',
              placeholder: '请告知如何调整',
              required: false,
            },
          },
        ],
      },
    });

    expect(asked).toMatchObject({
      key: 'run_plan_1#run_plan_1_coder_plan_confirm_1',
      runId: 'run_plan_1',
      awaitingId: 'run_plan_1_coder_plan_confirm_1',
      timeout: 0,
      mode: 'plan',
      plan: {
        id: 'confirm',
        planningId: 'run_plan_1_planning_1',
        title: '实施此计划？',
        options: [
          { label: '是，实施此计划', decision: 'approve' },
          {
            label: '否，请告知如何调整',
            decision: 'reject',
            input: {
              type: 'text',
              placeholder: '请告知如何调整',
              required: false,
            },
          },
        ],
      },
    });
  });

  it('keeps html forms without action when form data is present', () => {
    const current = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_leave_1',
      awaitingId: 'await_leave_1',
      viewportType: ViewportTypeEnum.Html,
      viewportKey: 'leave_form',
      mode: 'form',
      forms: [
        {
          id: 'form-1',
          title: 'mock 请假申请',
          form: {
            applicant_id: 'E1001',
            department_id: 'engineering',
            leave_type: 'annual',
            start_date: '2026-04-20',
            end_date: '2026-04-22',
            days: 2.5,
            reason: 'family_trip',
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
        id: 'form-1',
        title: 'mock 请假申请',
        form: {
          applicant_id: 'E1001',
          department_id: 'engineering',
          leave_type: 'annual',
          start_date: '2026-04-20',
          end_date: '2026-04-22',
          days: 2.5,
          reason: 'family_trip',
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

  it('ignores toolTimeout when awaiting.ask provides timeout', () => {
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
      resolutionReason: 'remote_answered',
    });
  });

  it('marks matching awaiting.answer timeout errors with timeout resolution reason', () => {
    const current = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      mode: 'approval',
      approvals: [
        {
          id: 'approve_1',
          command: '删除生产环境缓存',
        },
      ],
    });

    const next = reduceActiveAwaiting(current, {
      type: 'awaiting.answer',
      runId: 'run_1',
      awaitingId: 'await_1',
      status: 'error',
      errorCode: 'timeout',
      errorMessage: '等待项已超时',
    } as any);

    expect(next).toMatchObject({
      awaitingId: 'await_1',
      resolutionReason: 'timeout',
    });
  });

  it('recognizes nested awaiting.answer timeout errors', () => {
    const current = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      mode: 'question',
      questions: [
        {
          id: 'q1',
          type: 'text',
          question: '目标是什么？',
        },
      ],
    });

    const next = reduceActiveAwaiting(current, {
      type: 'awaiting.answer',
      runId: 'run_1',
      awaitingId: 'await_1',
      status: 'error',
      error: {
        code: 'timeout',
        message: '等待项已超时',
      },
    });

    expect(next).toMatchObject({
      awaitingId: 'await_1',
      resolutionReason: 'timeout',
    });
  });

  it('ignores push-only awaiting.answered so it does not resolve active awaiting data', () => {
    const current = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      mode: 'approval',
      approvals: [
        {
          id: 'approve_1',
          command: '删除生产环境缓存',
        },
      ],
    });

    const next = reduceActiveAwaiting(current, {
      type: 'awaiting.answered',
      runId: 'run_1',
      awaitingId: 'await_1',
      status: 'answered',
    } as any);

    expect(next).toBe(current);
    expect(next).toMatchObject({
      awaitingId: 'await_1',
      mode: 'approval',
      approvals: [
        {
          id: 'approve_1',
          command: '删除生产环境缓存',
        },
      ],
    });
  });

  it('clears awaiting when awaiting.answer has this client submitId', () => {
    const current = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      mode: 'question',
      questions: [
        {
          id: 'q1',
          type: 'text',
          question: '目标是什么？',
        },
      ],
    });

    const pending = current ? { ...current, pendingSubmitId: 'submit_1' } : current;
    const next = reduceActiveAwaiting(pending, {
      type: 'awaiting.answer',
      runId: 'run_1',
      awaitingId: 'await_1',
      submitId: 'submit_1',
      status: 'answered',
      answers: [
        {
          id: 'q1',
          answer: 'Ship it',
        },
      ],
    });

    expect(next).toBeNull();
  });

  it('clears awaiting when awaiting.answer matches pending submitId from runtime options', () => {
    const current = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      mode: 'question',
      questions: [
        {
          id: 'q1',
          type: 'text',
          question: '目标是什么？',
        },
      ],
    });

    const next = reduceActiveAwaiting(
      current,
      {
        type: 'awaiting.answer',
        runId: 'run_1',
        awaitingId: 'await_1',
        submitId: 'submit_1',
        status: 'answered',
        answers: [
          {
            id: 'q1',
            answer: 'Ship it',
          },
        ],
      },
      { pendingSubmitId: 'submit_1' },
    );

    expect(next).toBeNull();
  });

  it('clears matching historical awaiting.answer without marking remote answered', () => {
    const current = reduceActiveAwaiting(null, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      mode: 'approval',
      approvals: [
        {
          id: 'approve_1',
          command: '删除生产环境缓存',
        },
      ],
    });

    const next = reduceActiveAwaiting(
      current,
      {
        type: 'awaiting.answer',
        runId: 'run_1',
        awaitingId: 'await_1',
        status: 'answered',
      },
      { markRemoteAnswer: false },
    );

    expect(next).toBeNull();
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
