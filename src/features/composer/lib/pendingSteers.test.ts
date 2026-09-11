import type { ComposerState, PendingSteer } from './composerState';
import { findPendingSteer, reduceComposerSteerState } from './pendingSteers';

const steer: PendingSteer = {
  steerId: 'steer-a', runId: 'run-a', requestId: 'req-a', message: 'steering', status: 'sending', createdAt: 1,
};
const target = { chatId: 'chat-a', runId: 'run-a', steerId: 'steer-a' };
function initialState(): Pick<ComposerState, 'pendingSteers' | 'composerDraft' | 'composerDraftByChatId'> {
  return {
    pendingSteers: { 'chat-a': [steer], 'chat-b': [{ ...steer }] },
    composerDraft: 'B draft', composerDraftByChatId: { 'chat-a': 'A draft', 'chat-b': 'B draft' },
  };
}

it('uses steerId and available chat/run identity without falling back to requestId', () => {
  const state = initialState();
  expect(findPendingSteer(state.pendingSteers, target)?.steer).toBe(steer);
  expect(findPendingSteer(state.pendingSteers, { ...target, steerId: steer.requestId })).toBeNull();
  expect(findPendingSteer(state.pendingSteers, { ...target, runId: 'wrong-run' })).toBeNull();
  expect(findPendingSteer(state.pendingSteers, { steerId: steer.steerId })?.steer).toBe(steer);
});

it('confirmation removes only the matching chat entry and leaves drafts intact', () => {
  const state = initialState();
  const next = { ...state, ...reduceComposerSteerState(state, { type: 'CONFIRM_PENDING_STEER', ...target }, 'chat-b') };
  expect(next.pendingSteers['chat-a']).toBeUndefined();
  expect(next.pendingSteers['chat-b']).toBe(state.pendingSteers['chat-b']);
  expect(next.composerDraftByChatId).toBe(state.composerDraftByChatId);
  expect(next.composerDraft).toBe('B draft');
  expect(reduceComposerSteerState(next, { type: 'RESTORE_PENDING_STEER', ...target }, 'chat-b')).toBeNull();
  expect(reduceComposerSteerState(next, { type: 'SET_PENDING_STEER_ERROR', ...target, error: 'late failure' }, 'chat-b')).toBeNull();
});

it('repeated restoration cannot duplicate the recovered text', () => {
  const state = initialState();
  const action = { type: 'RESTORE_PENDING_STEER' as const, ...target };
  const next = { ...state, ...reduceComposerSteerState(state, action, 'chat-b') };
  expect(next.composerDraftByChatId['chat-a']).toBe('A draft\n\nsteering');
  expect(next.composerDraft).toBe('B draft');
  expect(reduceComposerSteerState(next, action, 'chat-b')).toBeNull();
});

it('preserves a matching existing draft when cancelling a queued message', () => {
  const state = initialState();
  state.composerDraft = steer.message;
  expect(reduceComposerSteerState(state, { type: 'RESTORE_PENDING_STEER', ...target }, 'chat-a')?.composerDraft).toBe(steer.message);
});
