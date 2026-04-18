import type { Chat, WorkerRow } from '@/app/state/types';
import { buildWorkerConversationRows } from '@/features/workers/lib/workerConversationFormatter';

describe('buildWorkerConversationRows', () => {
  it('orders worker conversations by updatedAt descending', () => {
    const worker: WorkerRow = {
      key: 'agent:agent-alpha',
      type: 'agent',
      sourceId: 'agent-alpha',
      displayName: 'Alpha',
      role: '--',
      teamAgentLabels: [],
      latestChatId: 'chat_newer',
      latestRunId: 'a1',
      latestUpdatedAt: 200,
      latestChatName: 'Newer chat',
      latestRunContent: '',
      hasHistory: true,
      latestRunSortValue: 0,
      searchText: '',
    };

    const chats: Chat[] = [
      {
        chatId: 'chat_newer',
        chatName: 'Newer chat',
        agentKey: 'agent-alpha',
        lastRunId: 'a1',
        updatedAt: 200,
      } as Chat,
      {
        chatId: 'chat_older',
        chatName: 'Older chat',
        agentKey: 'agent-alpha',
        lastRunId: 'z9',
        updatedAt: 100,
      } as Chat,
    ];

    const rows = buildWorkerConversationRows({ chats, worker });

    expect(rows.map((row) => row.chatId)).toEqual([
      'chat_newer',
      'chat_older',
    ]);
  });
});
