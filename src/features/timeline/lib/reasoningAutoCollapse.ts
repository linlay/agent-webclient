import type { AppAction } from '@/app/state/AppContext';
import type { TimelineNode, UiTimerHandle } from '@/app/state/types';

function getTimerApi(): Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'> {
  return (globalThis.window || globalThis) as Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;
}

function defaultScheduleTimer(callback: () => void, delay: number): UiTimerHandle {
  return getTimerApi().setTimeout(callback, delay) as unknown as UiTimerHandle;
}

function defaultClearTimer(timer: UiTimerHandle): void {
  getTimerApi().clearTimeout(timer as unknown as ReturnType<typeof globalThis.setTimeout>);
}

type ReasoningStateSnapshot = {
  reasoningCollapseTimers: Map<string, UiTimerHandle>;
  reasoningNodeById: Map<string, string>;
  timelineNodes: Map<string, TimelineNode>;
};

type ReasoningDispatch = (action: AppAction) => void;

export function clearReasoningAutoCollapseTimer(input: {
  reasoningId: string;
  getState: () => ReasoningStateSnapshot;
  dispatch: ReasoningDispatch;
  clearTimer?: (timer: UiTimerHandle) => void;
}): void {
  const reasoningId = String(input.reasoningId || '').trim();
  if (!reasoningId) return;

  const timer = input.getState().reasoningCollapseTimers.get(reasoningId);
  if (!timer) return;

  const clearTimer = input.clearTimer || defaultClearTimer;
  clearTimer(timer);
  input.dispatch({
    type: 'CLEAR_REASONING_COLLAPSE_TIMER',
    reasoningId,
  });
}

export function scheduleReasoningAutoCollapseTimer(input: {
  reasoningId: string;
  nodeId: string;
  delayMs: number;
  getState: () => ReasoningStateSnapshot;
  dispatch: ReasoningDispatch;
  scheduleTimer?: (
    callback: () => void,
    delay: number,
  ) => UiTimerHandle;
  clearTimer?: (timer: UiTimerHandle) => void;
}): UiTimerHandle | null {
  const reasoningId = String(input.reasoningId || '').trim();
  const nodeId = String(input.nodeId || '').trim();
  if (!reasoningId || !nodeId) return null;

  clearReasoningAutoCollapseTimer({
    reasoningId,
    getState: input.getState,
    dispatch: input.dispatch,
    clearTimer: input.clearTimer,
  });

  const timerFactory = input.scheduleTimer || defaultScheduleTimer;
  const timer = timerFactory(() => {
    const state = input.getState();
    const mappedNodeId = state.reasoningNodeById.get(reasoningId);
    if (!mappedNodeId || mappedNodeId !== nodeId) {
      input.dispatch({
        type: 'CLEAR_REASONING_COLLAPSE_TIMER',
        reasoningId,
      });
      return;
    }

    const existingNode = state.timelineNodes.get(nodeId);
    if (
      !existingNode
      || existingNode.kind !== 'thinking'
      || existingNode.status === 'running'
      || existingNode.expanded === false
    ) {
      input.dispatch({
        type: 'CLEAR_REASONING_COLLAPSE_TIMER',
        reasoningId,
      });
      return;
    }

    input.dispatch({
      type: 'SET_TIMELINE_NODE',
      id: nodeId,
      node: {
        ...existingNode,
        expanded: false,
      },
    });
    input.dispatch({
      type: 'CLEAR_REASONING_COLLAPSE_TIMER',
      reasoningId,
    });
  }, input.delayMs);

  input.dispatch({
    type: 'SET_REASONING_COLLAPSE_TIMER',
    reasoningId,
    timer,
  });

  return timer;
}
