import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SteerBar } from './SteerBar';
import type { PendingSteer } from '../lib/composerState';

jest.mock('antd', () => ({
  Button: ({ children, loading, disabled }: { children: React.ReactNode; loading?: boolean; disabled?: boolean }) =>
    React.createElement('button', { 'data-loading': String(Boolean(loading)), disabled }, children),
  Typography: { Text: ({ children }: { children: React.ReactNode }) => React.createElement('span', null, children) },
}));
jest.mock('@/shared/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const steer: PendingSteer = {
  steerId: 'steer-a', runId: 'run-a', requestId: 'req-a', message: 'steering', status: 'sending', createdAt: 1,
};

it('keeps the sending indicator active while waiting for stream confirmation', () => {
  const html = renderToStaticMarkup(React.createElement(SteerBar, {
    pendingSteers: [steer], mainChatRunning: true, onSubmit: jest.fn(), onCancel: jest.fn(),
  }));
  expect(html).toContain('data-loading="true" disabled=""');
  expect(html).toContain('composer.steer.waiting');
  expect(html).toContain('steering');
});

it('displays an unknown submission outcome without removing the message', () => {
  const html = renderToStaticMarkup(React.createElement(SteerBar, {
    pendingSteers: [{ ...steer, submissionError: 'response lost' }], mainChatRunning: false,
    onSubmit: jest.fn(), onCancel: jest.fn(),
  }));
  expect(html).toContain('composer.steer.unknown');
  expect(html).toContain('composer.steer.waiting');
  expect(html).toContain('steering');
  expect(html).toContain('<button data-loading="false">composer.steer.cancel</button>');
});
