import type { Agent, Chat, Team } from '../context/types';
import { createReplayState, replayEvent } from './useChatActions';

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

  it('replays tool.args into parsed toolParams and pretty argsText', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'tool.start',
      toolId: 'tool_args',
      toolName: 'demo.run',
      timestamp: 100,
    });
    replayEvent(state, {
      type: 'tool.args',
      toolId: 'tool_args',
      delta: '{"foo":"bar"}',
      timestamp: 110,
    });

    expect(state.toolStates.get('tool_args')?.toolParams).toEqual({ foo: 'bar' });
    expect(state.timelineNodes.get('tool_0')).toMatchObject({
      argsText: '{\n  "foo": "bar"\n}',
      status: 'running',
    });
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

  it('marks plan tasks completed for plan.task.end', () => {
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
      type: 'plan.task.end',
      taskId: 'task_1',
    });

    expect(state.planRuntimeByTaskId.get('task_1')?.status).toBe('completed');
    expect(state.planCurrentRunningTaskId).toBe('');
  });

  it('replays request.steer as a user timeline node', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'request.steer',
      steerId: 'steer_1',
      message: '请收敛一点',
      timestamp: 100,
    });
    replayEvent(state, {
      type: 'run.cancel',
      runId: 'run_1',
      timestamp: 120,
    });

    const node = state.timelineNodes.get('steer_steer_1');
    expect(node).toMatchObject({ role: 'user', messageVariant: 'steer', text: '请收敛一点' });
    expect(state.events.at(-1)?.type).toBe('run.cancel');
  });
});
