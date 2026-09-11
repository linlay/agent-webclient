import type { Chat } from "@/features/chats/lib/chatState";
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

	it('does not let an older detail response overwrite a newer read push', () => {
		const merged = mergeChatSummary(
			{
				chatId: 'chat_1',
				updatedAt: 200,
				lastRunId: 'run-2',
				lastRunContent: 'new answer',
				read: { isRead: true, readAt: 220, readRunId: 'run-2' },
			},
			{
				chatId: 'chat_1',
				updatedAt: 100,
				lastRunId: 'run-1',
				lastRunContent: 'old answer',
				read: { isRead: false, readAt: 90, readRunId: '' },
			},
		);

		expect(merged).toMatchObject({
			updatedAt: 200,
			lastRunId: 'run-2',
			lastRunContent: 'new answer',
			read: { isRead: true, readAt: 220, readRunId: 'run-2' },
		});
	});

	it('allows a newer run unread state after the previous run was read', () => {
		const merged = mergeChatSummary(
			{
				chatId: 'chat_1',
				updatedAt: 100,
				lastRunId: 'run-1',
				read: { isRead: true, readAt: 110, readRunId: 'run-1' },
			},
			{
				chatId: 'chat_1',
				updatedAt: 200,
				lastRunId: 'run-2',
				read: { isRead: false, readRunId: 'run-1' },
			},
		);

		expect(merged.read).toEqual({
			isRead: false,
			readAt: 110,
			readRunId: 'run-1',
		});
	});

});
