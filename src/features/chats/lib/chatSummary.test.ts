import type { Chat, WorkerRow } from '@/app/state/types';
import {
  buildSelectedWorkerConversationRows,
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

  it('rebuilds selected worker conversations from the latest chats', () => {
    const workerIndexByKey = new Map<string, WorkerRow>([
      [
        'agent:agent-alice',
        {
          key: 'agent:agent-alice',
          type: 'agent',
          sourceId: 'agent-alice',
          displayName: 'Alice',
          role: '--',
          teamAgentLabels: [],
          latestChatId: 'chat_2',
          latestRunId: 'run_b',
          latestUpdatedAt: 200,
          latestChatName: 'New chat',
          latestRunContent: 'new',
          hasHistory: true,
          latestRunSortValue: 11,
          searchText: '',
        },
      ],
    ]);

    const rows = buildSelectedWorkerConversationRows({
      chats: [
        {
          chatId: 'chat_1',
          chatName: 'Old chat',
          agentKey: 'agent-alice',
          lastRunId: 'run_a',
          lastRunContent: 'old',
          updatedAt: 100,
        },
        {
          chatId: 'chat_2',
          chatName: 'New chat',
          agentKey: 'agent-alice',
          lastRunId: 'run_b',
          lastRunContent: 'new',
          updatedAt: 200,
        },
      ],
      workerSelectionKey: 'agent:agent-alice',
      workerIndexByKey,
    });

    expect(rows.map((row) => row.chatId)).toEqual(['chat_2', 'chat_1']);
  });
});
