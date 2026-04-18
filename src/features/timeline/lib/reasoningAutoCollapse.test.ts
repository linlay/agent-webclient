import { appReducer, createInitialState } from '@/app/state/AppContext';
import type { AppState, TimelineNode } from '@/app/state/types';
import {
  clearReasoningAutoCollapseTimer,
  scheduleReasoningAutoCollapseTimer,
} from '@/features/timeline/lib/reasoningAutoCollapse';

function createThinkingNode(partial: Partial<TimelineNode> = {}): TimelineNode {
  return {
    id: 'thinking_1',
    kind: 'thinking',
    text: 'analysis',
    status: 'completed',
    expanded: true,
    ts: 100,
    ...partial,
  };
}

describe('reasoningAutoCollapse', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => '',
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function createStateHarness(): {
    getState: () => AppState;
    dispatch: (action: Parameters<typeof appReducer>[1]) => void;
  } {
    let state: AppState = {
      ...createInitialState(),
      reasoningNodeById: new Map([['reasoning_1', 'thinking_1']]),
      timelineNodes: new Map([['thinking_1', createThinkingNode()]]),
    };

    return {
      getState: () => state,
      dispatch: (action) => {
        state = appReducer(state, action);
      },
    };
  }

  it('collapses completed thinking nodes after the delay', async () => {
    const harness = createStateHarness();

    scheduleReasoningAutoCollapseTimer({
      reasoningId: 'reasoning_1',
      nodeId: 'thinking_1',
      delayMs: 1500,
      getState: harness.getState,
      dispatch: harness.dispatch,
    });

    expect(harness.getState().timelineNodes.get('thinking_1')?.expanded).toBe(true);

    await jest.advanceTimersByTimeAsync(1500);

    expect(harness.getState().timelineNodes.get('thinking_1')?.expanded).toBe(false);
    expect(harness.getState().reasoningCollapseTimers.has('reasoning_1')).toBe(false);
  });

  it('cancels pending auto-collapse when the timer is cleared manually', async () => {
    const harness = createStateHarness();

    scheduleReasoningAutoCollapseTimer({
      reasoningId: 'reasoning_1',
      nodeId: 'thinking_1',
      delayMs: 1500,
      getState: harness.getState,
      dispatch: harness.dispatch,
    });

    clearReasoningAutoCollapseTimer({
      reasoningId: 'reasoning_1',
      getState: harness.getState,
      dispatch: harness.dispatch,
    });

    await jest.advanceTimersByTimeAsync(1500);

    expect(harness.getState().timelineNodes.get('thinking_1')?.expanded).toBe(true);
    expect(harness.getState().reasoningCollapseTimers.has('reasoning_1')).toBe(false);
  });
});
