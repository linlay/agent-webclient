import type { Agent } from "@/features/agents/lib/agentState";
import type { Chat } from "@/features/chats/lib/chatState";
import type { Team } from "@/features/workers/lib/workerState";
import {
  extractChatsFromAgents,
  refreshWorkerDataFromAgentsWithChats,
  splitWorkerListItems,
} from '@/features/workers/lib/workerDataCoordinator';

describe('refreshWorkerDataFromAgentsWithChats', () => {
  const currentTeams: Team[] = [{ teamId: 'team-old', name: 'Old Team' } as Team];
  const currentChats: Chat[] = [{ chatId: 'chat-old', chatName: 'Old Chat' } as Chat];

  it('keeps the current worker data untouched and logs a failed unified refresh', async () => {
    const applyAgents = jest.fn();
    const applyTeams = jest.fn();
    const applyWorkerOrderKeys = jest.fn();
    const applyChats = jest.fn();
    const rebuildWorkerRows = jest.fn();
    const appendDebug = jest.fn();
    await refreshWorkerDataFromAgentsWithChats({
      fetchAgents: jest.fn().mockRejectedValue(new Error('agents unavailable')),
      getSnapshot: () => ({
        agents: [],
        teams: currentTeams,
        chats: currentChats,
        workerOrderKeys: [],
        workerSelectionKey: '',
        workerPriorityKey: '',
      }),
      applyAgents,
      applyTeams,
      applyWorkerOrderKeys,
      applyChats,
      rebuildWorkerRows,
      appendDebug,
    });
    for (const apply of [applyAgents, applyTeams, applyWorkerOrderKeys, applyChats, rebuildWorkerRows]) {
      expect(apply).not.toHaveBeenCalled();
    }
    expect(appendDebug).toHaveBeenCalledWith('[loadAgents error] agents unavailable');
  });

  it('extracts agent chats and fills missing agentKey from the parent agent', () => {
    expect(
      extractChatsFromAgents([
        {
          key: 'agent-a',
          name: 'Agent A',
          chats: [
            { chatId: 'chat-a', chatName: 'Chat A' },
            { chatId: '', chatName: 'Missing id' },
          ],
        } as Agent,
      ]),
    ).toEqual([
      { chatId: 'chat-a', chatName: 'Chat A', agentKey: 'agent-a' },
    ]);
  });

  it('marks nested agent chats with awaiting as pending while preserving awaiting summary', () => {
    const awaiting = {
      awaitingId: 'await_1',
      runId: 'run_1',
      mode: 'question',
      status: 'awaiting',
      createdAt: 123,
    };

    expect(
      extractChatsFromAgents([
        {
          key: 'agent-a',
          name: 'Agent A',
          chats: [
            {
              chatId: 'chat-awaiting',
              chatName: 'Need answer',
              awaiting,
            },
          ],
        } as Agent,
      ]),
    ).toEqual([
      {
        chatId: 'chat-awaiting',
        chatName: 'Need answer',
        agentKey: 'agent-a',
        awaiting,
        hasPendingAwaiting: true,
      },
    ]);
  });

  it('keeps explicit hasPendingAwaiting false on nested agent chats with awaiting', () => {
    expect(
      extractChatsFromAgents([
        {
          key: 'agent-a',
          name: 'Agent A',
          chats: [
            {
              chatId: 'chat-cleared',
              chatName: 'Cleared answer',
              awaiting: {
                awaitingId: 'await_1',
                runId: 'run_1',
                mode: 'question',
                status: 'awaiting',
                createdAt: 123,
              },
              hasPendingAwaiting: false,
            },
          ],
        } as Agent,
      ]),
    ).toEqual([
      {
        chatId: 'chat-cleared',
        chatName: 'Cleared answer',
        agentKey: 'agent-a',
        awaiting: {
          awaitingId: 'await_1',
          runId: 'run_1',
          mode: 'question',
          status: 'awaiting',
          createdAt: 123,
        },
        hasPendingAwaiting: false,
      },
    ]);
  });

  it('splits mixed items, fills Team chat ownership, and preserves source order', () => {
    expect(splitWorkerListItems([
      {
        kind: 'team',
        teamId: 'team-ops',
        name: 'Ops',
        stats: { totalCount: 3, unreadCount: 1 },
        chats: [{ chatId: 'team-chat', chatName: 'Team Chat', lastRunId: 'run_team' }],
      } as Team,
      {
        kind: 'agent',
        key: 'agent-a',
        name: 'Agent A',
        chats: [{ chatId: 'agent-chat', chatName: 'Agent Chat', lastRunId: 'run_agent' }],
      } as Agent,
    ])).toEqual({
      agents: [expect.objectContaining({ key: 'agent-a' })],
      teams: [expect.objectContaining({ teamId: 'team-ops', stats: { totalCount: 3, unreadCount: 1 } })],
      chats: [
        expect.objectContaining({ chatId: 'team-chat', teamId: 'team-ops' }),
        expect.objectContaining({ chatId: 'agent-chat', agentKey: 'agent-a' }),
      ],
      workerOrderKeys: ['team:team-ops', 'agent:agent-a'],
    });
  });

  it('refreshes from one mixed list, updates Teams, and rebuilds once', async () => {
    const applyAgents = jest.fn();
    const applyTeams = jest.fn();
    const applyWorkerOrderKeys = jest.fn();
    const applyChats = jest.fn();
    const rebuildWorkerRows = jest.fn();

    const items = [
      {
        kind: 'team',
        teamId: 'team-new',
        name: 'New Team',
        chats: [{ chatId: 'team-chat', chatName: 'Team Chat' }],
      } as Team,
      {
        kind: 'agent',
        key: 'agent-new',
        name: 'New Agent',
        chats: [{ chatId: 'chat-new', chatName: 'New Chat' }],
      } as Agent,
    ];

    await refreshWorkerDataFromAgentsWithChats({
      fetchAgents: jest.fn().mockResolvedValue(items),
      getSnapshot: () => ({
        agents: [],
        teams: currentTeams,
        chats: currentChats,
        workerOrderKeys: ['team:team-old'],
        workerSelectionKey: 'agent:agent-new',
        workerPriorityKey: 'agent:agent-old',
      }),
      applyAgents,
      applyTeams,
      applyWorkerOrderKeys,
      applyChats,
      rebuildWorkerRows,
      appendDebug: jest.fn(),
    });

    const expectedChats = [
      { chatId: 'team-chat', chatName: 'Team Chat', teamId: 'team-new' },
      { chatId: 'chat-new', chatName: 'New Chat', agentKey: 'agent-new' },
      { chatId: 'chat-old', chatName: 'Old Chat' },
    ];
    expect(applyAgents).toHaveBeenCalledWith([items[1]]);
    expect(applyTeams).toHaveBeenCalledWith([items[0]]);
    expect(applyWorkerOrderKeys).toHaveBeenCalledWith(['team:team-new', 'agent:agent-new']);
    expect(applyChats).toHaveBeenCalledWith(expectedChats);
    expect(rebuildWorkerRows).toHaveBeenCalledTimes(1);
    expect(rebuildWorkerRows).toHaveBeenCalledWith({
      agents: [items[1]],
      teams: [items[0]],
      chats: expectedChats,
      workerOrderKeys: ['team:team-new', 'agent:agent-new'],
      workerSelectionKey: 'agent:agent-new',
      workerPriorityKey: 'agent:agent-old',
    });
  });
});
