import type { AgentEvent, TimelineNode } from '../context/types';
import { buildTimelineDisplayItems } from './timelineDisplay';

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
    });
    expect(items[1].kind === 'run' ? items[1].nodes.map((node) => node.id) : []).toEqual([
      'thinking_1',
      'tool_1',
      'content_1',
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
  });

  it('falls back to the last node time when terminal run event lacks timestamp', () => {
    const items = buildTimelineDisplayItems(
      [
        createNode({ id: 'user_1', kind: 'message', role: 'user', ts: 100 }),
        createNode({ id: 'tool_1', kind: 'tool', ts: 190 }),
      ],
      [
        { type: 'request.query', timestamp: 100 },
        { type: 'run.end' },
      ],
    );

    expect(items[1].kind === 'run' ? items[1].completedAt : 'bad').toBe(190);
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
});
