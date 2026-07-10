import type { Chat } from '@/app/state/types';
import {
  mergeChatSummary,
  mergeFetchedChats,
  upsertChatSummary,
} from '@/features/chats/lib/chatSummary';

describe('chatSummary helpers', () => {
  it('merges explicit chat summary fields without dropping known metadata', () => {
    const merged = mergeChatSummary(
      {
        chatId: 'chat_1',
        chatName: 'Original name',
        firstAgentName: 'Alice',
        firstAgentKey: 'agent-alice',
        agentKey: 'agent-alice',
      },
      {
        chatId: 'chat_1',
        lastRunId: 'run_2',
        lastRunContent: 'Latest answer',
      },
    );

    expect(merged).toMatchObject({
      chatId: 'chat_1',
      chatName: 'Original name',
      firstAgentName: 'Alice',
      firstAgentKey: 'agent-alice',
      agentKey: 'agent-alice',
      lastRunId: 'run_2',
      lastRunContent: 'Latest answer',
    });
  });

  it('keeps explicit false awaiting state when newer patches clear pending approval', () => {
    const merged = mergeChatSummary(
      {
        chatId: 'chat_1',
        hasPendingAwaiting: true,
      },
      {
        chatId: 'chat_1',
        hasPendingAwaiting: false,
      },
    );

    expect(merged.hasPendingAwaiting).toBe(false);
  });

  it('moves an updated chat summary to the front', () => {
    const chats: Chat[] = [
      { chatId: 'chat_old', chatName: 'Old chat' },
      { chatId: 'chat_other', chatName: 'Other chat' },
    ];

    const next = upsertChatSummary(chats, {
      chatId: 'chat_other',
      lastRunId: 'run_9',
    });

    expect(next.map((chat) => chat.chatId)).toEqual([
      'chat_other',
      'chat_old',
    ]);
  });

  it('keeps locally upserted chats when fetched chat snapshots are merged in', () => {
    const merged = mergeFetchedChats(
      [
        {
          chatId: 'chat_local',
          chatName: 'Local chat',
          lastRunId: 'run_local',
        },
      ],
      [
        {
          chatId: 'chat_remote',
          chatName: 'Remote chat',
          lastRunId: 'run_remote',
        },
      ],
    );

    expect(merged.map((chat) => chat.chatId)).toEqual([
      'chat_remote',
      'chat_local',
    ]);
  });

});
