import { createInitialState } from '../context/AppContext';
import { findMatchingPendingSteer, shouldSyncLiveCache } from './useAgentEventHandler';

describe('findMatchingPendingSteer', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => '',
      },
    });
  });

  it('matches only when steerId exists in pending steers', () => {
    const state = {
      ...createInitialState(),
      pendingSteers: [
        {
          steerId: '55a9ce3e-0ae2-4cbd-8224-0e0dd4d62c34',
          message: '突然计划去北京。',
          requestId: 'req_1773506656934_drp9ko',
          runId: 'mmqk2gej',
          createdAt: 100,
        },
      ],
    };

    const matched = findMatchingPendingSteer(state, {
      type: 'request.steer',
      steerId: '55a9ce3e-0ae2-4cbd-8224-0e0dd4d62c34',
      requestId: 'req_1773506656934_drp9ko',
      message: '突然计划去北京。',
    });

    expect(matched?.message).toBe('突然计划去北京。');
  });

  it('does not fallback to requestId when steerId does not match', () => {
    const state = {
      ...createInitialState(),
      pendingSteers: [
        {
          steerId: 'pending_steer_id',
          message: '突然计划去北京。',
          requestId: 'req_1773506656934_drp9ko',
          runId: 'mmqk2gej',
          createdAt: 100,
        },
      ],
    };

    const matched = findMatchingPendingSteer(state, {
      type: 'request.steer',
      steerId: '55a9ce3e-0ae2-4cbd-8224-0e0dd4d62c34',
      requestId: 'req_1773506656934_drp9ko',
      message: '突然计划去北京。',
    });

    expect(matched).toBeNull();
  });
});

describe('shouldSyncLiveCache', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => '',
      },
    });
  });

  it('requests cache rebuild when restored state text is ahead of cached node text', () => {
    const baseState = createInitialState();
    const state = {
      ...baseState,
      chatId: 'chat_1',
      runId: 'run_1',
      timelineCounter: 1,
      timelineNodes: new Map([
        ['content_0', {
          id: 'content_0',
          kind: 'content' as const,
          contentId: 'content_1',
          text: 'Hello world',
          segments: [],
          ts: 100,
        }],
      ]),
      timelineOrder: ['content_0'],
      contentNodeById: new Map([['content_1', 'content_0']]),
    };

    const cache = {
      contentNodeById: new Map([['content_1', 'content_0']]),
      reasoningNodeById: new Map(),
      toolNodeById: new Map(),
      toolStateById: new Map(),
      nodeText: new Map([['content_0', 'Hello']]),
      counter: 1,
      activeReasoningKey: '',
      chatId: 'chat_1',
      runId: 'run_1',
      agentKey: '',
      teamId: '',
    };

    expect(shouldSyncLiveCache(cache as never, state)).toBe(true);
  });
});
