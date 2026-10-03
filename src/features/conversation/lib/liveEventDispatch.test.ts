/** @jest-environment jsdom */
import { appReducer, createInitialState } from '@/app/state/AppContext';
import type { AppAction, AppState } from '@/app/state/AppContext';
import { applyLiveEventCommand } from './liveEventDispatch';
import { createLocalCacheFromState } from './liveEventCache';

it.each([false, true])('applies a live plan with resetRuntime=%s without touching task or display state', (resetRuntime) => {
  const initial: AppState = { ...createInitialState(),
    planRuntimeByTaskId: new Map([['task', { status: 'running', updatedAt: 1, error: '' }]]),
    planCurrentRunningTaskId: 'task', planLastTouchedTaskId: 'task',
    planExpanded: true, planManualOverride: true,
  };
  let state = initial;
  const actions: AppAction[] = [];
  const plan = { planId: 'next', plan: [] };
  applyLiveEventCommand({ command: { cmd: 'SET_PLAN', plan, resetRuntime },
    cache: createLocalCacheFromState(state), state,
    dispatch: action => { actions.push(action); state = appReducer(state, action); },
  });
  expect(actions.map(action => action.type)).toEqual(resetRuntime ? ['RESET_PLAN_RUNTIME', 'SET_PLAN'] : ['SET_PLAN']);
  expect(state.plan).toBe(plan);
  expect(state.planRuntimeByTaskId.size).toBe(resetRuntime ? 0 : 1);
  expect(state.planCurrentRunningTaskId).toBe(resetRuntime ? '' : 'task');
  expect(state.planLastTouchedTaskId).toBe(resetRuntime ? '' : 'task');
  expect(initial.planRuntimeByTaskId.size).toBe(1);
  expect(state.taskItemsById).toBe(initial.taskItemsById);
  expect(state.activeTaskIds).toBe(initial.activeTaskIds);
  expect(state.planExpanded).toBe(true);
  expect(state.planManualOverride).toBe(true);
});
