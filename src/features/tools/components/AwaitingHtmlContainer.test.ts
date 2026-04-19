import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ViewportTypeEnum } from '@/app/state/types';
import type { FormActiveAwaiting } from '@/app/state/types';
import {
  AWAITING_COLLECT_TIMEOUT_ERROR,
  AWAITING_COLLECT_TIMEOUT_MS,
  AwaitingHtmlContainer,
  beginAwaitingCollectRequest,
  clearAwaitingCollectRequest,
} from '@/features/tools/components/AwaitingHtmlContainer';

jest.mock('antd', () => {
  const ReactRuntime = require('react');
  return {
    Button: ({ children, ...props }: Record<string, unknown>) =>
      ReactRuntime.createElement('button', props, children),
    message: {
      info: jest.fn(),
    },
  };
});

jest.mock('@/features/transport/lib/apiClientProxy', () => ({
  getViewport: jest.fn(),
}));

function createActiveAwaiting(
  patch: Partial<FormActiveAwaiting> = {},
): FormActiveAwaiting {
  return {
    key: 'run_1#await_1',
    awaitingId: 'await_1',
    runId: 'run_1',
    timeout: 60,
    viewportKey: 'leave_form',
    viewportType: ViewportTypeEnum.Html,
    mode: 'form',
    forms: [
      {
        id: 'leave_form',
        action: '提交请假申请',
        initialPayload: {
          employee_id: 'E1001',
        },
      },
    ],
    loading: false,
    loadError: '',
    viewportHtml: '<html><body>ok</body></html>',
    ...patch,
  };
}

describe('AwaitingHtmlContainer', () => {
  it('renders submit and reject buttons for form mode', () => {
    const html = renderToStaticMarkup(
      React.createElement(AwaitingHtmlContainer, {
        data: createActiveAwaiting(),
      }),
    );

    expect(html).toContain('提交');
    expect(html).toContain('驳回');
  });

  it('posts collect messages, enters collecting state, and times out if iframe does not submit', () => {
    const postMessage = jest.fn();
    const onCollectingChange = jest.fn();
    const onStatusChange = jest.fn();
    const onErrorChange = jest.fn();
    let timeoutCallback: (() => void) | null = null;

    const timeout = beginAwaitingCollectRequest({
      awaiting: createActiveAwaiting(),
      decision: 'submit',
      postMessage,
      scheduleTimeout: (callback, delay) => {
        timeoutCallback = callback;
        expect(delay).toBe(AWAITING_COLLECT_TIMEOUT_MS);
        return 123 as unknown as ReturnType<typeof setTimeout>;
      },
      onCollectingChange,
      onStatusChange,
      onErrorChange,
    });

    expect(timeout).toBe(123);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'awaiting_collect',
      data: {
        runId: 'run_1',
        awaitingId: 'await_1',
        decision: 'submit',
      },
    }, '*');
    expect(onCollectingChange).toHaveBeenCalledWith('submit');
    expect(onStatusChange).toHaveBeenCalledWith('采集中...');
    expect(onErrorChange).toHaveBeenCalledWith('');

    timeoutCallback?.();

    expect(onCollectingChange).toHaveBeenLastCalledWith(null);
    expect(onStatusChange).toHaveBeenLastCalledWith('');
    expect(onErrorChange).toHaveBeenLastCalledWith(
      AWAITING_COLLECT_TIMEOUT_ERROR,
    );
  });

  it('clears collecting state before submit handling continues', () => {
    const clearTimeoutFn = jest.fn();
    const onCollectingChange = jest.fn();
    const onStatusChange = jest.fn();

    clearAwaitingCollectRequest(
      clearTimeoutFn,
      456 as unknown as ReturnType<typeof setTimeout>,
      {
        onCollectingChange,
        onStatusChange,
      },
    );

    expect(clearTimeoutFn).toHaveBeenCalledWith(456);
    expect(onCollectingChange).toHaveBeenCalledWith(null);
    expect(onStatusChange).toHaveBeenCalledWith('');
  });
});

