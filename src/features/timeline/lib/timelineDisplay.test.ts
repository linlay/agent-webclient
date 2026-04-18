import type { AgentEvent, TimelineNode } from '@/app/state/types';
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
});
