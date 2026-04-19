import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AwaitingAnswerBlock } from '@/features/timeline/components/AwaitingAnswerBlock';

jest.mock('@/app/state/AppContext', () => ({
  useAppDispatch: () => jest.fn(),
}));

describe('AwaitingAnswerBlock', () => {
  it('prefers question as title and renders header as subtitle', () => {
    const html = renderToStaticMarkup(
      React.createElement(AwaitingAnswerBlock, {
        node: {
          id: 'node_1',
          kind: 'awaiting.answer',
          text: JSON.stringify([
            {
              id: 'q1',
              question: '仙尊想看哪种类型的两个问题演示？',
              header: '场景选择',
              answer: '双选问题',
            },
          ]),
          expanded: true,
          ts: 0,
        } as any,
      }),
    );

    expect(html).toContain('仙尊想看哪种类型的两个问题演示？');
    expect(html).toContain('场景选择');
    expect(html).toContain('双选问题');
  });
});
