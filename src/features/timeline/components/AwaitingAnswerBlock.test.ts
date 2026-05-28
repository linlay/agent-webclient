import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AwaitingAnswerBlock } from '@/features/timeline/components/AwaitingAnswerBlock';

jest.mock('@/app/state/AppContext', () => ({
  useAppDispatch: () => jest.fn(),
}));

describe('AwaitingAnswerBlock', () => {
  it('renders question and answer without showing the header', () => {
    const html = renderToStaticMarkup(
      React.createElement(AwaitingAnswerBlock, {
        node: {
          id: 'node_1',
          kind: 'awaiting.answer',
          text: JSON.stringify({
            status: 'answered',
            items: [
              {
                id: 'q1',
                question: '仙尊想看哪种类型的两个问题演示？',
                header: '场景选择',
                answer: '双选问题',
              },
            ],
          }),
          expanded: true,
          ts: 0,
        } as any,
      }),
    );

    expect(html).toContain('仙尊想看哪种类型的两个问题演示？');
    expect(html).not.toContain('场景选择');
    expect(html).toContain('双选问题');
  });

  it('joins multi-select answers into a readable value line', () => {
    const html = renderToStaticMarkup(
      React.createElement(AwaitingAnswerBlock, {
        node: {
          id: 'node_2',
          kind: 'awaiting.answer',
          text: JSON.stringify({
            status: 'answered',
            items: [
              {
                id: 'q2',
                question: '您希望通过AI助手提升哪些方面的工作效率？（可多选）',
                answers: ['数据分析', '代码开发', '会议纪要'],
              },
            ],
          }),
          expanded: true,
          ts: 0,
        } as any,
      }),
    );

    expect(html).toContain('您希望通过AI助手提升哪些方面的工作效率？（可多选）');
    expect(html).toContain('数据分析, 代码开发, 会议纪要');
  });

  it('renders error payloads as a single status row', () => {
    const html = renderToStaticMarkup(
      React.createElement(AwaitingAnswerBlock, {
        node: {
          id: 'node_3',
          kind: 'awaiting.answer',
          title: '等待已超时',
          text: JSON.stringify({
            status: 'error',
            error: {
              code: 'timeout',
              message: '等待项已超时',
            },
          }),
          expanded: true,
          ts: 0,
        } as any,
      }),
    );

    expect(html).toContain('等待已超时');
    expect(html).toContain('状态');
    expect(html).toContain('等待项已超时');
  });

  it('renders submitted form data from the form field', () => {
    const html = renderToStaticMarkup(
      React.createElement(AwaitingAnswerBlock, {
        node: {
          id: 'node_4',
          kind: 'awaiting.answer',
          text: JSON.stringify({
            status: 'answered',
            items: [
              {
                id: 'form_1',
                title: '请假申请',
                action: 'submit',
                form: {
                  applicant_id: 'E1001',
                  days: 2,
                },
              },
            ],
          }),
          expanded: true,
          ts: 0,
        } as any,
      }),
    );

    expect(html).toContain('请假申请');
    expect(html).toContain('&quot;applicant_id&quot;: &quot;E1001&quot;');
    expect(html).toContain('&quot;days&quot;: 2');
  });

  it('renders approval decisions with Chinese labels while keeping reasons visible', () => {
    const html = renderToStaticMarkup(
      React.createElement(AwaitingAnswerBlock, {
        node: {
          id: 'node_5',
          kind: 'awaiting.answer',
          text: JSON.stringify({
            status: 'answered',
            items: [
              { id: 'a1', title: '普通审批', decision: 'approve' },
              { id: 'a2', title: '规则放行', decision: 'approve_rule_run' },
              { id: 'a4', title: '拒绝审批', decision: 'reject', reason: '风险过高' },
            ],
          }),
          expanded: true,
          ts: 0,
        } as any,
      }),
    );

    expect(html).toContain('同意');
    expect(html).toContain('同意（本次运行同规则都放行）');
    expect(html).toContain('拒绝 · 风险过高');
    expect(html).not.toContain('approve_rule_run');
  });

  it('renders plan decisions from the single plan envelope', () => {
    const html = renderToStaticMarkup(
      React.createElement(AwaitingAnswerBlock, {
        node: {
          id: 'node_6',
          kind: 'awaiting.answer',
          text: JSON.stringify({
            status: 'answered',
            plan: {
              id: 'confirm',
              planningId: 'run_1_planning_1',
              decision: 'reject',
              reason: '请补充测试范围',
            },
          }),
          expanded: true,
          ts: 0,
        } as any,
      }),
    );

    expect(html).toContain('run_1_planning_1');
    expect(html).toContain('拒绝 · 请补充测试范围');
  });
});
