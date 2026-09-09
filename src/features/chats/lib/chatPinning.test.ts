/** @jest-environment jsdom */
import { applyChatPinnedOrder, selectPinnedChats, buildPinnedChatMove } from './chatPinning';
import { reduceChatPinningState } from './chatPinningState';
import { createInitialChatsState } from './chatState';
import type { ChatsAction } from './chatState';
import { reduceNavigationState } from '@/app/state/reducerNavigation';
import { createInitialState } from '@/app/state/state';

describe('unified chat pinning', () => {
  const chats = [
    { chatId: 'ordinary', agentKey: 'normal', updatedAt: 1_710_000_000_003 },
    { chatId: 'coder', agentKey: 'coder', updatedAt: 1_710_000_000_002 },
    { chatId: 'kbase', agentKey: 'kb', updatedAt: 1_710_000_000_001 },
    { chatId: 'team', teamId: 'ops', updatedAt: 1_710_000_000_000 },
  ];
  it('uses a global order across owners independent of content times', () => {
    const order = ['team', 'kbase', 'ordinary', 'coder'];
    const result = selectPinnedChats(applyChatPinnedOrder(chats, order), order);
    expect(result.map(c => c.chatId)).toEqual(order);
    for (const chat of result) expect(chat.updatedAt).toBe(chats.find(c => c.chatId === chat.chatId)!.updatedAt);
    expect(chats.some(c => 'pinned' in c)).toBe(false);
  });
  it('moves using an anchor in the same pinned group', () => {
    expect(buildPinnedChatMove(['a', 'b', 'c'], 'a', 'c')).toEqual({ operation: 'move', chatId: 'a', afterChatId: 'c' });
    expect(buildPinnedChatMove(['a', 'b', 'c'], 'c', 'a')).toEqual({ operation: 'move', chatId: 'c', beforeChatId: 'a' });
    expect(buildPinnedChatMove(['a', 'b'], 'a', 'a')).toBeNull();
    expect(buildPinnedChatMove(['a', 'b'], 'a', 'unpinned')).toBeNull();
  });
  it('protects pushes and deletes arriving during a pinned list fetch', () => {
    const baseChats = [{ chatId: 'a', chatName: 'old', hasActiveRun: false }, { chatId: 'deleted' }];
    const state = { ...createInitialChatsState(), chats: [{ ...baseChats[0], chatName: 'renamed', hasActiveRun: true, read: { isRead: true, readAt: 1_710_000_000_100 } }] };
    const action: ChatsAction = { type: 'SET_CHAT_PINNING', order: ['a', 'deleted', 'new'], baseChats, chats: [...baseChats, { chatId: 'new', teamId: 'ops' }] };
    const result = reduceChatPinningState(state, action)!;
    expect(result.chatPinnedOrder).toEqual(['a', 'new']);
    expect(result.chats.find(c => c.chatId === 'a')).toMatchObject({ chatName: 'renamed', hasActiveRun: true, pinned: true, read: { isRead: true } });
    expect(result.chats.some(c => c.chatId === 'deleted')).toBe(false);
  });
  it('preserves pin membership through stale summaries and clears it on archive', () => {
    let state = { ...createInitialState(), chats };
    state = reduceNavigationState(state, { type: 'SET_CHAT_PINNING', order: ['coder'] })!;
    state = reduceNavigationState(state, { type: 'UPSERT_CHAT', chat: { chatId: 'coder', pinned: false, hasActiveRun: true } })!;
    expect(state.chats.find(c => c.chatId === 'coder')).toMatchObject({ pinned: true, hasActiveRun: true });
    state = reduceNavigationState(state, { type: 'CHAT_ARCHIVED', chatId: 'coder' })!;
    expect(state.chatPinnedOrder).toEqual([]);
    expect(selectPinnedChats(state.chats, state.chatPinnedOrder)).toEqual([]);
  });
});
