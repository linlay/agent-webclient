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
});
