import type { Agent, Chat } from '@/app/state/types';
import { buildWorkerRows } from '@/features/workers/lib/workerListFormatter';

describe('buildWorkerRows', () => {
  it('orders worker rows by latest updatedAt descending', () => {
    const agents: Agent[] = [
      { key: 'agent-alpha', name: 'Alpha' } as Agent,
      { key: 'agent-beta', name: 'Beta' } as Agent,
    ];
    const chats: Chat[] = [
      {
        chatId: 'chat_1',
        chatName: 'Alpha chat',
        agentKey: 'agent-alpha',
        lastRunId: 'z9',
        updatedAt: 100,
      } as Chat,
      {
        chatId: 'chat_2',
        chatName: 'Beta chat',
        agentKey: 'agent-beta',
        lastRunId: 'a1',
        updatedAt: 200,
      } as Chat,
    ];

    const rows = buildWorkerRows({
      agents,
      teams: [],
      chats,
      workerPriorityKey: 'agent:agent-alpha',
    });

    expect(rows.map((row) => row.key)).toEqual([
      'agent:agent-beta',
      'agent:agent-alpha',
    ]);
  });

  it('selects the latest worker chat by updatedAt instead of lastRunId', () => {
    const rows = buildWorkerRows({
      agents: [{ key: 'agent-alpha', name: 'Alpha' } as Agent],
      teams: [],
      chats: [
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
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: 'agent:agent-alpha',
      latestChatId: 'chat_newer',
      latestUpdatedAt: 200,
    });
  });

  it('does not create an extra row for a priority worker without history', () => {
    const rows = buildWorkerRows({
      agents: [],
      teams: [],
      chats: [],
      workerPriorityKey: 'agent:agent-new',
    });

    expect(rows).toEqual([]);
  });
});
