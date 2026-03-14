import type { Agent, Chat } from '../context/types';
import { buildWorkerRows } from './workerListFormatter';

describe('buildWorkerRows worker priority', () => {
  it('pins an existing agent row to the front immediately', () => {
    const agents: Agent[] = [
      { key: 'agent-alpha', name: 'Alpha' } as Agent,
      { key: 'agent-beta', name: 'Beta' } as Agent,
    ];
    const chats: Chat[] = [
      {
        chatId: 'chat_1',
        chatName: 'Alpha chat',
        agentKey: 'agent-alpha',
        lastRunId: 'a1',
        updatedAt: 100,
      } as Chat,
    ];

    const rows = buildWorkerRows({
      agents,
      teams: [],
      chats,
      workerPriorityKey: 'agent:agent-beta',
    });

    expect(rows[0]?.key).toBe('agent:agent-beta');
    expect(rows[1]?.key).toBe('agent:agent-alpha');
  });

  it('creates a temporary top row when the prioritized agent is not loaded yet', () => {
    const rows = buildWorkerRows({
      agents: [],
      teams: [],
      chats: [],
      workerPriorityKey: 'agent:agent-new',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: 'agent:agent-new',
      sourceId: 'agent-new',
      displayName: 'agent-new',
      hasHistory: false,
    });
  });

  it('does not duplicate the prioritized agent after chat history arrives', () => {
    const chats: Chat[] = [
      {
        chatId: 'chat_1',
        chatName: 'Beta chat',
        agentKey: 'agent-beta',
        lastRunId: 'b1',
        updatedAt: 100,
      } as Chat,
    ];

    const rows = buildWorkerRows({
      agents: [],
      teams: [],
      chats,
      workerPriorityKey: 'agent:agent-beta',
    });

    expect(rows.filter((row) => row.key === 'agent:agent-beta')).toHaveLength(1);
    expect(rows[0]?.latestChatId).toBe('chat_1');
  });
});
