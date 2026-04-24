import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ViewportTypeEnum } from '@/app/state/types';
import type { FormActiveAwaiting } from '@/app/state/types';
import {
  AWAITING_COLLECT_TIMEOUT_ERROR,
  AWAITING_COLLECT_TIMEOUT_MS,
  AwaitingHtmlContainer,
  INVALID_AWAITING_SUBMIT_ERROR,
  beginAwaitingCollectRequest,
  bindAwaitingInitListener,
  buildAggregatedAwaitingSubmitPayload,
  clearAwaitingCollectRequest,
  mergeSubmittedParamsIntoAwaitingForms,
  reportInvalidAwaitingSubmitPayload,
} from '@/features/tools/components/AwaitingHtmlContainer';

const originalWarn = console.warn;

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
        title: 'mock 请假申请',
        payload: {
          applicant_id: 'E1001',
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
  beforeEach(() => {
    console.warn = jest.fn();
  });

  afterEach(() => {
    console.warn = originalWarn;
  });

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

  it('warns and reports error when iframe submit payload shape is invalid', () => {
    const onErrorChange = jest.fn();
    reportInvalidAwaitingSubmitPayload('await_1', {
      type: 'frontend_awaiting_submit',
      params: [{ payload: 'bad' }],
    }, onErrorChange);

    expect(console.warn).toHaveBeenCalledWith(
      '[awaiting-html] invalid frontend_awaiting_submit payload',
      expect.objectContaining({
        awaitingId: 'await_1',
      }),
    );
    expect(onErrorChange).toHaveBeenCalledWith(
      INVALID_AWAITING_SUBMIT_ERROR,
    );
  });

  it('binds iframe load and sends init immediately', () => {
    const addEventListener = jest.fn();
    const removeEventListener = jest.fn();
    const sendInit = jest.fn();

    const cleanup = bindAwaitingInitListener({
      addEventListener,
      removeEventListener,
    }, sendInit);

    expect(addEventListener).toHaveBeenCalledWith('load', sendInit);
    expect(sendInit).toHaveBeenCalledTimes(1);

    cleanup();

    expect(removeEventListener).toHaveBeenCalledWith('load', sendInit);
  });

  it('merges collected form payloads back into the awaiting form list', () => {
    expect(mergeSubmittedParamsIntoAwaitingForms([
      {
        id: 'leave_form',
        action: '提交请假申请',
        title: 'mock 请假申请',
        payload: {
          employee_id: 'E1001',
        },
      },
      {
        id: 'travel_form',
        action: '提交出差申请',
        title: 'mock 出差申请',
        payload: {
          employee_id: 'E2002',
        },
      },
    ], [
      {
        id: 'travel_form',
        payload: {
          employee_id: 'E3003',
        },
      },
    ])).toEqual([
      {
        id: 'leave_form',
        action: '提交请假申请',
        title: 'mock 请假申请',
        payload: {
          employee_id: 'E1001',
        },
      },
      {
        id: 'travel_form',
        action: '提交出差申请',
        title: 'mock 出差申请',
        payload: {
          employee_id: 'E3003',
        },
      },
    ]);
  });

  it('builds final submit payloads that include all forms', () => {
    expect(buildAggregatedAwaitingSubmitPayload(createActiveAwaiting({
      forms: [
        {
          id: 'leave_form',
          action: '提交请假申请',
          title: 'mock 请假申请',
          payload: {
            employee_id: 'E1001',
          },
        },
        {
          id: 'travel_form',
          action: '提交出差申请',
          title: 'mock 出差申请',
          payload: {
            employee_id: 'E2002',
          },
        },
      ],
    }), [
      {
        id: 'travel_form',
        payload: {
          employee_id: 'E3003',
        },
      },
    ])).toEqual({
      runId: 'run_1',
      awaitingId: 'await_1',
      params: [
        {
          id: 'leave_form',
          payload: {
            employee_id: 'E1001',
          },
        },
        {
          id: 'travel_form',
          payload: {
            employee_id: 'E3003',
          },
        },
      ],
    });
  });
});
