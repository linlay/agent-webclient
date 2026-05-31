import type { Agent, Chat, Team } from '@/app/state/types';
import {
  extractChatsFromAgents,
  refreshWorkerDataFromAgentsWithChats,
  refreshWorkerDataWithCoordinator,
} from '@/features/workers/lib/workerDataCoordinator';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('refreshWorkerDataWithCoordinator', () => {
  const currentAgents: Agent[] = [{ key: 'agent-old', name: 'Old Agent' } as Agent];
  const currentTeams: Team[] = [{ teamId: 'team-old', name: 'Old Team' } as Team];
  const currentChats: Chat[] = [{ chatId: 'chat-old', chatName: 'Old Chat' } as Chat];

  it('waits for agents and teams to settle before applying chats and rebuilds once', async () => {
    const agentsDeferred = createDeferred<Agent[]>();
    const teamsDeferred = createDeferred<Team[]>();
    const chatsDeferred = createDeferred<Chat[]>();
    const steps: string[] = [];

    const refreshPromise = refreshWorkerDataWithCoordinator({
      fetchAgents: jest.fn(() => {
        steps.push('fetch:agents');
        return agentsDeferred.promise;
      }),
      fetchTeams: jest.fn(() => {
        steps.push('fetch:teams');
        return teamsDeferred.promise;
      }),
      fetchChats: jest.fn(() => {
        steps.push('fetch:chats');
        return chatsDeferred.promise;
      }),
      getSnapshot: () => ({
        agents: currentAgents,
        teams: currentTeams,
        chats: currentChats,
        workerSelectionKey: 'team:team-old',
        workerPriorityKey: 'agent:agent-old',
      }),
      applyAgents: jest.fn((agents: Agent[]) => {
        steps.push(`apply:agents:${agents[0]?.key || ''}`);
      }),
      applyTeams: jest.fn((teams: Team[]) => {
        steps.push(`apply:teams:${teams[0]?.teamId || ''}`);
      }),
      applyChats: jest.fn((chats: Chat[]) => {
        steps.push(`apply:chats:${chats[0]?.chatId || ''}`);
      }),
      rebuildWorkerRows: jest.fn((overrides) => {
        steps.push(`rebuild:${overrides.chats?.[0]?.chatId || ''}`);
      }),
      appendDebug: jest.fn(),
    });

    chatsDeferred.resolve([{ chatId: 'chat-new', chatName: 'New Chat' } as Chat]);
    await Promise.resolve();
    expect(steps).toEqual(['fetch:agents', 'fetch:teams', 'fetch:chats']);

    agentsDeferred.resolve([{ key: 'agent-new', name: 'New Agent' } as Agent]);
    await Promise.resolve();
    expect(steps).toEqual(['fetch:agents', 'fetch:teams', 'fetch:chats']);

    teamsDeferred.resolve([{ teamId: 'team-new', name: 'New Team' } as Team]);
    await refreshPromise;

    expect(steps).toEqual([
      'fetch:agents',
      'fetch:teams',
      'fetch:chats',
      'apply:agents:agent-new',
      'apply:teams:team-new',
      'apply:chats:chat-new',
      'rebuild:chat-new',
    ]);
  });

  it('keeps chats pending until all requests settle and preserves debug logs on partial failure', async () => {
    const appendDebug = jest.fn();
    const applyAgents = jest.fn();
    const applyTeams = jest.fn();
    const applyChats = jest.fn();
    const rebuildWorkerRows = jest.fn();

    await refreshWorkerDataWithCoordinator({
      fetchAgents: jest.fn().mockRejectedValue(new Error('agents unavailable')),
      fetchTeams: jest.fn().mockResolvedValue([{ teamId: 'team-new', name: 'New Team' } as Team]),
      fetchChats: jest.fn().mockResolvedValue([{ chatId: 'chat-new', chatName: 'New Chat' } as Chat]),
      getSnapshot: () => ({
        agents: currentAgents,
        teams: currentTeams,
        chats: currentChats,
        workerSelectionKey: 'team:team-old',
        workerPriorityKey: 'agent:agent-old',
      }),
      applyAgents,
      applyTeams,
      applyChats,
      rebuildWorkerRows,
      appendDebug,
    });

    expect(appendDebug).toHaveBeenCalledWith('[loadAgents error] agents unavailable');
    expect(applyAgents).not.toHaveBeenCalled();
    expect(applyTeams).toHaveBeenCalledWith([{ teamId: 'team-new', name: 'New Team' }]);
    expect(applyChats).toHaveBeenCalledWith([
      { chatId: 'chat-new', chatName: 'New Chat' },
      { chatId: 'chat-old', chatName: 'Old Chat' },
    ]);
    expect(rebuildWorkerRows).toHaveBeenCalledTimes(1);
    expect(rebuildWorkerRows).toHaveBeenCalledWith({
      agents: currentAgents,
      teams: [{ teamId: 'team-new', name: 'New Team' }],
      chats: [
        { chatId: 'chat-new', chatName: 'New Chat' },
        { chatId: 'chat-old', chatName: 'Old Chat' },
      ],
      workerSelectionKey: 'team:team-old',
      workerPriorityKey: 'agent:agent-old',
    });
  });
});

describe('refreshWorkerDataFromAgentsWithChats', () => {
  const currentTeams: Team[] = [{ teamId: 'team-old', name: 'Old Team' } as Team];
  const currentChats: Chat[] = [{ chatId: 'chat-old', chatName: 'Old Chat' } as Chat];

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

  it('refreshes from agents only, merges chats, preserves current teams, and rebuilds once', async () => {
    const applyAgents = jest.fn();
    const applyChats = jest.fn();
    const rebuildWorkerRows = jest.fn();

    const agents = [
      {
        key: 'agent-new',
        name: 'New Agent',
        chats: [{ chatId: 'chat-new', chatName: 'New Chat' }],
      } as Agent,
    ];

    await refreshWorkerDataFromAgentsWithChats({
      fetchAgents: jest.fn().mockResolvedValue(agents),
      getSnapshot: () => ({
        agents: [],
        teams: currentTeams,
        chats: currentChats,
        workerSelectionKey: 'agent:agent-new',
        workerPriorityKey: 'agent:agent-old',
      }),
      applyAgents,
      applyChats,
      rebuildWorkerRows,
      appendDebug: jest.fn(),
    });

    const expectedChats = [
      { chatId: 'chat-new', chatName: 'New Chat', agentKey: 'agent-new' },
      { chatId: 'chat-old', chatName: 'Old Chat' },
    ];
    expect(applyAgents).toHaveBeenCalledWith(agents);
    expect(applyChats).toHaveBeenCalledWith(expectedChats);
    expect(rebuildWorkerRows).toHaveBeenCalledTimes(1);
    expect(rebuildWorkerRows).toHaveBeenCalledWith({
      agents,
      teams: currentTeams,
      chats: expectedChats,
      workerSelectionKey: 'agent:agent-new',
      workerPriorityKey: 'agent:agent-old',
    });
  });
});
