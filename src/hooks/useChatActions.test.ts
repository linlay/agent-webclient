import type { Agent, Chat, Team } from '../context/types';
import { createReplayState, normalizeChatArtifactItems, replayEvent, setReplayArtifacts, setReplayPlan } from './useChatActions';

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

  it('marks plan tasks completed for task.complete', () => {
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
      type: 'task.start',
      taskId: 'task_1',
    });
    replayEvent(state, {
      type: 'task.complete',
      taskId: 'task_1',
    });

    expect(state.planRuntimeByTaskId.get('task_1')?.status).toBe('completed');
    expect(state.planCurrentRunningTaskId).toBe('');
  });

  it('replays artifact.publish into persistent artifact state', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'artifact.publish',
      artifactId: 'artifact_1',
      timestamp: 120,
      artifact: {
        type: 'file',
        name: 'run.log',
        mimeType: 'text/plain',
        sha256: 'sha-log',
        sizeBytes: 512,
        url: 'https://example.com/run.log',
      },
    });

    expect(state.artifacts).toEqual([
      {
        artifactId: 'artifact_1',
        timestamp: 120,
        artifact: {
          type: 'file',
          name: 'run.log',
          mimeType: 'text/plain',
          sha256: 'sha-log',
          sizeBytes: 512,
          url: 'https://example.com/run.log',
        },
      },
    ]);
  });

  it('applies getChat artifact.items snapshots over replayed artifacts', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'artifact.publish',
      artifactId: 'artifact_old',
      timestamp: 120,
      artifact: {
        type: 'file',
        name: 'old.log',
        mimeType: 'text/plain',
        sha256: 'sha-old',
        sizeBytes: 128,
        url: 'https://example.com/old.log',
      },
    });

    setReplayArtifacts(state, [
      {
        artifactId: 'artifact_new',
        timestamp: 0,
        artifact: {
          type: 'file',
          name: 'new.log',
          mimeType: 'text/plain',
          sha256: 'sha-new',
          sizeBytes: 256,
          url: 'https://example.com/new.log',
        },
      },
    ]);

    expect(state.artifacts).toEqual([
      {
        artifactId: 'artifact_new',
        timestamp: 0,
        artifact: {
          type: 'file',
          name: 'new.log',
          mimeType: 'text/plain',
          sha256: 'sha-new',
          sizeBytes: 256,
          url: 'https://example.com/new.log',
        },
      },
    ]);
  });

  it('normalizes getChat artifact.items payloads into published artifacts', () => {
    expect(
      normalizeChatArtifactItems({
        items: [
          {
            artifactId: 'artifact_1',
            type: 'file',
            name: 'report.pdf',
            mimeType: 'application/pdf',
            sha256: 'sha-report',
            sizeBytes: 1024,
            url: 'https://example.com/report.pdf',
          },
        ],
      }),
    ).toEqual([
      {
        artifactId: 'artifact_1',
        timestamp: 0,
        artifact: {
          type: 'file',
          name: 'report.pdf',
          mimeType: 'application/pdf',
          sha256: 'sha-report',
          sizeBytes: 1024,
          url: 'https://example.com/report.pdf',
        },
      },
    ]);
  });

  it('applies getChat plan snapshots without clearing matching runtime state', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'plan.update',
      planId: 'plan_1',
      plan: [{ taskId: 'task_1', description: 'old step' }],
    });
    replayEvent(state, {
      type: 'task.start',
      taskId: 'task_1',
    });

    setReplayPlan(
      state,
      {
        planId: 'plan_1',
        plan: [{ taskId: 'task_1', description: 'new step' }],
      },
      { resetRuntime: false },
    );

    expect(state.plan).toEqual({
      planId: 'plan_1',
      plan: [{ taskId: 'task_1', description: 'new step' }],
    });
    expect(state.planRuntimeByTaskId.get('task_1')?.status).toBe('running');
    expect(state.planCurrentRunningTaskId).toBe('task_1');
  });

  it('clears plan runtime when getChat plan snapshot replaces a different plan', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'plan.update',
      planId: 'plan_1',
      plan: [{ taskId: 'task_1', description: 'step 1' }],
    });
    replayEvent(state, {
      type: 'task.start',
      taskId: 'task_1',
    });

    setReplayPlan(
      state,
      {
        planId: 'plan_2',
        plan: [{ taskId: 'task_2', description: 'step 2' }],
      },
      { resetRuntime: true },
    );

    expect(state.plan).toEqual({
      planId: 'plan_2',
      plan: [{ taskId: 'task_2', description: 'step 2' }],
    });
    expect(state.planRuntimeByTaskId.size).toBe(0);
    expect(state.planCurrentRunningTaskId).toBe('');
    expect(state.planLastTouchedTaskId).toBe('');
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

  it('replays request.query references into user attachments for history chats', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'request.query',
      requestId: 'req_history_1',
      message: '解析该文件',
      references: [
        {
          id: 'i1',
          type: 'image',
          name: 'drmjl-nfjxc-001.ico',
          sizeBytes: 67646,
        },
      ],
      timestamp: 100,
    });

    expect(state.timelineNodes.get('user_req_history_1')).toMatchObject({
      role: 'user',
      text: '解析该文件',
      attachments: [
        {
          name: 'drmjl-nfjxc-001.ico',
          size: 67646,
        },
      ],
    });
  });
});
