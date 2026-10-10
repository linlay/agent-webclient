/** @jest-environment jsdom */
import { appReducer } from './reducer';
import { createInitialState } from './state';
import type { AppState } from './types';
import type { ConversationReplaySnapshot } from './actions';

it('clears only the gateway identity catalogs in one state transition', () => {
  const state = { ...createInitialState(),
    chats: [{ chatId: 'chat' }],
    automations: [{ automationId: 'automation' }],
    chatPinnedOrder: ['chat'], chatPinningPending: true,
    chatId: 'chat', composerDraft: 'unsent', accessToken: 'token', agents: [{ key: 'agent', name: 'Agent' }, { key: 'team', mode: "TEAM" }] } as AppState;
  const next = appReducer(state, { type: 'CLEAR_GATEWAY_IDENTITY_STATE' });
  const expected = { chats: [], automations: [],
    chatPinnedOrder: null, chatPinningPending: false, agents: [] };
  expect(next).toMatchObject(expected);
  for (const key of Object.keys(state) as Array<keyof AppState>) {
    if (!(key in expected)) expect(next[key]).toBe(state[key]);
  }
  expect(state.chatPinnedOrder).toEqual(['chat']);
});

it('applies a complete replay atomically without overwriting unrelated fields from a wider object', () => {
  const state = { ...createInitialState(), chatId: 'old', composerDraft: 'keep draft', accessToken: 'keep token' };
  // A structurally compatible wider object must not extend the transaction scope.
  const replay = { ...createInitialState(), chatId: 'new', runId: 'run',
    timelineOrder: ['node'], timelineNodes: new Map([['node', { id: 'node', kind: 'content' as const, text: 'replayed', ts: 1 }]]),
    plan: { planId: 'plan', plan: [] }, activeTaskIds: new Set(['task']),
    composerDraft: 'ignore draft', accessToken: 'ignore token', streaming: true };
  const snapshot: ConversationReplaySnapshot = replay;
  const next = appReducer(state, { type: 'APPLY_CONVERSATION_REPLAY', snapshot });
  expect(next.chatId).toBe('new');
  expect(next.runId).toBe('run');
  expect(next.timelineNodes).toBe(replay.timelineNodes);
  expect(next.timelineOrder).toBe(replay.timelineOrder);
  expect(next.plan).toBe(replay.plan);
  expect(next.activeTaskIds).toBe(replay.activeTaskIds);
  expect(next.composerDraft).toBe('keep draft');
  expect(next.accessToken).toBe('keep token');
  expect(next.streaming).toBe(state.streaming);
  expect(next.composerEditVersion).toBe(state.composerEditVersion + 1);
  const reapplied = appReducer(next, { type: 'APPLY_CONVERSATION_REPLAY', snapshot });
  expect(reapplied.composerEditVersion).toBe(next.composerEditVersion);
  expect(state.timelineNodes.size).toBe(0);
});
