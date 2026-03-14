import type { Agent, Chat, Team } from '../context/types';
import { createReplayState, refreshWorkerDataWithCoordinator, replayEvent } from './useChatActions';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('replayEvent tool migration', () => {
  it('stores viewportKey from new MCP payload and keeps toolName for display', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'tool.start',
      toolId: 'call_f1494c0a4c4646cc81a41585',
      toolName: 'email.search',
      viewportKey: 'viewport_email_search',
      runId: 'run_1',
      timestamp: 100,
    });

    const toolState = state.toolStates.get('call_f1494c0a4c4646cc81a41585');
    const nodeId = state.toolNodeById.get('call_f1494c0a4c4646cc81a41585');
    const node = nodeId ? state.timelineNodes.get(nodeId) : null;

    expect(toolState?.viewportKey).toBe('viewport_email_search');
    expect(toolState).not.toHaveProperty('toolApi');
    expect(node?.toolName).toBe('email.search');
    expect(node?.viewportKey).toBe('viewport_email_search');
  });

  it('falls back to legacy toolKey during compatibility period', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'tool.start',
      toolId: 'tool_legacy',
      toolKey: 'legacy_viewport',
      timestamp: 100,
    });

    expect(state.toolStates.get('tool_legacy')?.viewportKey).toBe('legacy_viewport');
  });

  it('preserves toolName when later tool events omit it', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'tool.start',
      toolId: 'tool_args_case',
      toolName: 'email.list_accounts',
      timestamp: 100,
    });
    replayEvent(state, {
      type: 'tool.result',
      toolId: 'tool_args_case',
      result: 'ok',
      timestamp: 110,
    });

    const nodeId = state.toolNodeById.get('tool_args_case');
    const node = nodeId ? state.timelineNodes.get(nodeId) : null;

    expect(node?.toolName).toBe('email.list_accounts');
  });

  it('marks plan tasks completed for plan.task.complete compatibility', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'plan.update',
      planId: 'plan_1',
      plan: [
        { taskId: 'task_1', description: 'step 1' },
        { taskId: 'task_2', description: 'step 2' },
      ],
    });
    replayEvent(state, {
      type: 'plan.task.start',
      taskId: 'task_1',
    });
    replayEvent(state, {
      type: 'plan.task.complete',
      taskId: 'task_1',
    });

    expect(state.planRuntimeByTaskId.get('task_1')?.status).toBe('completed');
    expect(state.planCurrentRunningTaskId).toBe('');
  });
});

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
