import type {
  AgentEvent,
  TimelineNode,
} from '@/app/state/types';
import { buildTimelineDisplayItems } from '@/features/timeline/lib/timelineDisplay';

function createNode(partial: Partial<TimelineNode> & Pick<TimelineNode, 'id' | 'kind' | 'ts'>): TimelineNode {
  return {
    ...partial,
  } as TimelineNode;
}

describe('buildTimelineDisplayItems', () => {
  it('groups reasoning/tool/content after a query into one run', () => {
    const nodes: TimelineNode[] = [
      createNode({ id: 'user_1', kind: 'message', role: 'user', text: 'hi', ts: 100 }),
      createNode({ id: 'thinking_1', kind: 'thinking', text: 'plan', ts: 110 }),
      createNode({ id: 'tool_1', kind: 'tool', ts: 120 }),
      createNode({ id: 'content_1', kind: 'content', text: 'answer', ts: 130 }),
    ];
    const events: AgentEvent[] = [
      { type: 'request.query', timestamp: 100 },
      { type: 'run.complete', timestamp: 150 },
    ];

    const items = buildTimelineDisplayItems(nodes, events);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'query', node: { id: 'user_1' } });
    expect(items[1]).toMatchObject({
      kind: 'run',
      completedAt: 150,
      responseDurationMs: 50,
    });
    expect(items[1].kind === 'run' ? items[1].nodes.map((node) => node.id) : []).toEqual([
      'thinking_1',
      'tool_1',
      'content_1',
    ]);
    expect(items[1].kind === 'run' ? items[1].renderEntries.map((entry) => entry.key) : []).toEqual([
      'node_thinking_1',
      'node_tool_1',
      'node_content_1',
    ]);
  });

  it('keeps run time hidden while streaming without terminal run event', () => {
    const items = buildTimelineDisplayItems(
      [
        createNode({ id: 'user_1', kind: 'message', role: 'user', ts: 100 }),
        createNode({ id: 'content_1', kind: 'content', ts: 130 }),
      ],
      [{ type: 'request.query', timestamp: 100 }],
    );

    expect(items[1]).toMatchObject({ kind: 'run' });
    expect(items[1].kind === 'run' ? items[1].completedAt : 'bad').toBeUndefined();
    expect(items[1].kind === 'run' ? items[1].responseDurationMs : 'bad').toBeUndefined();
  });

  it('falls back to the last node time when terminal run event lacks timestamp', () => {
    const items = buildTimelineDisplayItems(
      [
        createNode({ id: 'user_1', kind: 'message', role: 'user', ts: 100 }),
        createNode({ id: 'tool_1', kind: 'tool', ts: 190 }),
      ],
      [
        { type: 'request.query', timestamp: 100 },
        { type: 'run.complete' },
      ],
    );

    expect(items[1].kind === 'run' ? items[1].completedAt : 'bad').toBe(190);
    expect(items[1].kind === 'run' ? items[1].responseDurationMs : 'bad').toBe(90);
  });

  it('treats run.cancel as a terminal event', () => {
    const items = buildTimelineDisplayItems(
      [
        createNode({ id: 'user_1', kind: 'message', role: 'user', ts: 100 }),
        createNode({ id: 'content_1', kind: 'content', ts: 130 }),
      ],
      [
        { type: 'request.query', timestamp: 100 },
        { type: 'run.cancel', timestamp: 160 },
      ],
    );

    expect(items[1].kind === 'run' ? items[1].completedAt : 'bad').toBe(160);
    expect(items[1].kind === 'run' ? items[1].responseDurationMs : 'bad').toBe(60);
  });

  it('builds a completed run without a user query node', () => {
    const items = buildTimelineDisplayItems(
      [
        createNode({ id: 'thinking_1', kind: 'thinking', text: 'plan', ts: 110 }),
        createNode({ id: 'content_1', kind: 'content', text: 'scheduled reply', ts: 130 }),
      ],
      [{ type: 'run.complete', timestamp: 160 }],
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'run',
      key: 'run_thinking_1',
      completedAt: 160,
      responseDurationMs: undefined,
      queryNode: null,
    });
    expect(items[0].kind === 'run' ? items[0].nodes.map((node) => node.id) : []).toEqual([
      'thinking_1',
      'content_1',
    ]);
  });

  it('keeps request.steer-style nodes inside the current run group', () => {
    const items = buildTimelineDisplayItems(
      [
        createNode({ id: 'user_1', kind: 'message', role: 'user', ts: 100 }),
        createNode({ id: 'steer_1', kind: 'message', role: 'user', messageVariant: 'steer', ts: 120 }),
        createNode({ id: 'content_1', kind: 'content', ts: 130 }),
      ],
      [
        { type: 'request.query', timestamp: 100 },
        { type: 'request.steer', timestamp: 120, steerId: 'steer_1' },
        { type: 'run.complete', timestamp: 160 },
      ],
    );

    expect(items).toHaveLength(2);
    expect(items[1].kind === 'run' ? items[1].nodes.map((node) => node.id) : []).toEqual([
      'steer_1',
      'content_1',
    ]);
  });

  it('merges consecutive tools with the same toolName and toolLabel into one render entry', () => {
    const items = buildTimelineDisplayItems(
      [
        createNode({ id: 'user_1', kind: 'message', role: 'user', ts: 100 }),
        createNode({ id: 'tool_1', kind: 'tool', toolName: '_sandbox_bash_', toolLabel: '执行命令', ts: 110 }),
        createNode({ id: 'tool_2', kind: 'tool', toolName: '_sandbox_bash_', toolLabel: '执行命令', ts: 120 }),
        createNode({ id: 'tool_3', kind: 'tool', toolName: '_sandbox_bash_', toolLabel: '执行命令', ts: 130 }),
      ],
      [{ type: 'request.query', timestamp: 100 }],
    );

    expect(items[1].kind === 'run' ? items[1].nodes.map((node) => node.id) : []).toEqual([
      'tool_1',
      'tool_2',
      'tool_3',
    ]);
    expect(items[1].kind === 'run' ? items[1].renderEntries : []).toEqual([
      {
        kind: 'tool-group',
        key: 'tool_group_tool_1',
        toolName: '_sandbox_bash_',
        toolLabel: '执行命令',
        count: 3,
        nodes: [
          expect.objectContaining({ id: 'tool_1' }),
          expect.objectContaining({ id: 'tool_2' }),
          expect.objectContaining({ id: 'tool_3' }),
        ],
      },
    ]);
  });

  it('does not merge tools when toolName or toolLabel changes, or when other nodes interrupt them', () => {
    const items = buildTimelineDisplayItems(
      [
        createNode({ id: 'user_1', kind: 'message', role: 'user', ts: 100 }),
        createNode({ id: 'tool_1', kind: 'tool', toolName: '_sandbox_bash_', toolLabel: '执行命令', ts: 110 }),
        createNode({ id: 'tool_2', kind: 'tool', toolName: '_sandbox_bash_', toolLabel: '执行命令 2', ts: 120 }),
        createNode({ id: 'tool_3', kind: 'tool', toolName: '_sandbox_bash_v2_', toolLabel: '执行命令', ts: 130 }),
        createNode({ id: 'thinking_1', kind: 'thinking', ts: 140 }),
        createNode({ id: 'tool_4', kind: 'tool', toolName: '_sandbox_bash_', toolLabel: '执行命令', ts: 150 }),
        createNode({ id: 'tool_5', kind: 'tool', toolName: '_sandbox_bash_', toolLabel: '执行命令', ts: 160 }),
      ],
      [{ type: 'request.query', timestamp: 100 }],
    );

    expect(items[1].kind === 'run' ? items[1].renderEntries.map((entry) => entry.key) : []).toEqual([
      'node_tool_1',
      'node_tool_2',
      'node_tool_3',
      'node_thinking_1',
      'tool_group_tool_4',
    ]);
    expect(
      items[1].kind === 'run'
        ? items[1].renderEntries[4]
        : null,
    ).toEqual({
      kind: 'tool-group',
      key: 'tool_group_tool_4',
      toolName: '_sandbox_bash_',
      toolLabel: '执行命令',
      count: 2,
      nodes: [
        expect.objectContaining({ id: 'tool_4' }),
        expect.objectContaining({ id: 'tool_5' }),
      ],
    });
  });

  it('groups task-owned reasoning/tool/content nodes into one task-group render entry', () => {
    const items = buildTimelineDisplayItems(
      [
        createNode({ id: 'user_1', kind: 'message', role: 'user', text: 'hi', ts: 100 }),
        createNode({ id: 'thinking_1', kind: 'thinking', text: 'plan', taskId: 'task_1', taskName: 'Explore webclient task panel rendering', taskGroupId: 'group_1', ts: 110 }),
        createNode({ id: 'tool_1', kind: 'tool', toolName: '_sandbox_bash_', toolLabel: '执行命令', taskId: 'task_1', taskName: 'Explore webclient task panel rendering', taskGroupId: 'group_1', ts: 120 }),
        createNode({ id: 'content_1', kind: 'content', text: 'answer', taskId: 'task_1', taskName: 'Explore webclient task panel rendering', taskGroupId: 'group_1', ts: 130 }),
      ],
      [
        { type: 'request.query', timestamp: 100 },
        { type: 'run.complete', timestamp: 200 },
      ],
      new Map([
        ['task_1', {
          taskId: 'task_1',
          taskName: 'Explore webclient task panel rendering',
          taskGroupId: 'group_1',
          runId: 'run_1',
          status: 'completed',
          startedAt: 110,
          endedAt: 180,
          durationMs: 70,
          updatedAt: 180,
          error: '',
        }],
      ]),
    );

    const entries = items[1].kind === 'run' ? items[1].renderEntries : [];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'task-group',
      taskId: 'task_1',
      taskName: 'Explore webclient task panel rendering',
      status: 'completed',
      durationMs: 70,
      nodes: [
        expect.objectContaining({ id: 'thinking_1' }),
        expect.objectContaining({ id: 'tool_1' }),
        expect.objectContaining({ id: 'content_1' }),
      ],
    });
    expect(entries[0].kind === 'task-group' ? entries[0].renderEntries.map((entry) => entry.key) : []).toEqual([
      'node_thinking_1',
      'node_tool_1',
      'node_content_1',
    ]);
  });

  it('keeps task-owned request.query nodes inside the task group', () => {
    const items = buildTimelineDisplayItems(
      [
        createNode({ id: 'user_task_1', kind: 'message', role: 'user', text: 'task question', taskId: 'task_1', taskName: 'Task A', ts: 100 }),
        createNode({ id: 'content_1', kind: 'content', text: 'task answer', taskId: 'task_1', taskName: 'Task A', ts: 120 }),
      ],
      [{ type: 'run.complete', timestamp: 150 }],
    );

    expect(items).toHaveLength(1);
    const entries = items[0].kind === 'run' ? items[0].renderEntries : [];
    expect(entries[0]).toMatchObject({
      kind: 'task-group',
      taskId: 'task_1',
      nodes: [
        expect.objectContaining({ id: 'user_task_1' }),
        expect.objectContaining({ id: 'content_1' }),
      ],
    });
  });

  it('preserves order across mixed task and non-task nodes', () => {
    const items = buildTimelineDisplayItems(
      [
        createNode({ id: 'user_1', kind: 'message', role: 'user', text: 'hi', ts: 100 }),
        createNode({ id: 'thinking_1', kind: 'thinking', text: 'plan', ts: 110 }),
        createNode({ id: 'tool_1', kind: 'tool', toolName: '_sandbox_bash_', toolLabel: '执行命令', taskId: 'task_1', taskName: 'Task A', taskGroupId: 'group_1', ts: 120 }),
        createNode({ id: 'content_1', kind: 'content', text: 'answer', ts: 130 }),
      ],
      [
        { type: 'request.query', timestamp: 100 },
        { type: 'run.complete', timestamp: 200 },
      ],
    );

    expect(items[1].kind === 'run' ? items[1].renderEntries.map((entry) => entry.key) : []).toEqual([
      'node_thinking_1',
      'task_group_task_1_tool_1',
      'node_content_1',
    ]);
  });

  it('creates separate task groups when taskId changes', () => {
    const items = buildTimelineDisplayItems(
      [
        createNode({ id: 'user_1', kind: 'message', role: 'user', text: 'hi', ts: 100 }),
        createNode({ id: 'thinking_1', kind: 'thinking', taskId: 'task_1', taskName: 'Task A', ts: 110 }),
        createNode({ id: 'thinking_2', kind: 'thinking', taskId: 'task_2', taskName: 'Task B', ts: 120 }),
      ],
      [{ type: 'request.query', timestamp: 100 }],
    );

    expect(items[1].kind === 'run' ? items[1].renderEntries.map((entry) => entry.key) : []).toEqual([
      'task_group_task_1_thinking_1',
      'task_group_task_2_thinking_2',
    ]);
  });

  it('merges non-consecutive nodes with the same taskId into the first task group', () => {
    const items = buildTimelineDisplayItems(
      [
        createNode({ id: 'user_1', kind: 'message', role: 'user', text: 'hi', ts: 100 }),
        createNode({ id: 'thinking_1', kind: 'thinking', taskId: 'task_1', taskName: 'Task A', ts: 110 }),
        createNode({ id: 'content_1', kind: 'content', text: 'between', ts: 120 }),
        createNode({ id: 'tool_1', kind: 'tool', toolName: '_sandbox_bash_', toolLabel: '执行命令', taskId: 'task_1', taskName: 'Task A', ts: 130 }),
      ],
      [{ type: 'request.query', timestamp: 100 }],
    );

    const entries = items[1].kind === 'run' ? items[1].renderEntries : [];
    expect(entries.map((entry) => entry.key)).toEqual([
      'task_group_task_1_thinking_1',
      'node_content_1',
    ]);
    expect(entries[0].kind === 'task-group' ? entries[0].nodes.map((node) => node.id) : []).toEqual([
      'thinking_1',
      'tool_1',
    ]);
    expect(entries[0].kind === 'task-group' ? entries[0].renderEntries.map((entry) => entry.key) : []).toEqual([
      'node_thinking_1',
      'node_tool_1',
    ]);
  });

  it('still merges matching tool nodes inside a task group', () => {
    const items = buildTimelineDisplayItems(
      [
        createNode({ id: 'user_1', kind: 'message', role: 'user', text: 'hi', ts: 100 }),
        createNode({ id: 'tool_1', kind: 'tool', toolName: '_sandbox_bash_', toolLabel: '执行命令', taskId: 'task_1', taskName: 'Task A', ts: 110 }),
        createNode({ id: 'tool_2', kind: 'tool', toolName: '_sandbox_bash_', toolLabel: '执行命令', taskId: 'task_1', taskName: 'Task A', ts: 120 }),
      ],
      [{ type: 'request.query', timestamp: 100 }],
    );

    const entries = items[1].kind === 'run' ? items[1].renderEntries : [];
    expect(entries[0].kind === 'task-group' ? entries[0].renderEntries : []).toEqual([
      {
        kind: 'tool-group',
        key: 'tool_group_tool_1',
        toolName: '_sandbox_bash_',
        toolLabel: '执行命令',
        count: 2,
        nodes: [
          expect.objectContaining({ id: 'tool_1' }),
          expect.objectContaining({ id: 'tool_2' }),
        ],
      },
    ]);
  });
});
