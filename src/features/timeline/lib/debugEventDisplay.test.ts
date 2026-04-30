import {
  classifyEventGroup,
  getEventId,
  getEventRowGroupClass,
  markDebugEventHidden,
  resolveDebugEventTarget,
  shouldDisplayDebugEvent,
} from '@/features/timeline/lib/debugEventDisplay';

describe('classifyEventGroup', () => {
  it('maps event types into dedicated debug color groups', () => {
    expect(classifyEventGroup('request.query')).toBe('request');
    expect(classifyEventGroup('request.steer')).toBe('request');
    expect(classifyEventGroup('chat.loaded')).toBe('chat');
    expect(classifyEventGroup('run.start')).toBe('run');
    expect(classifyEventGroup('awaiting.ask')).toBe('awaiting');
    expect(classifyEventGroup('memory.context')).toBe('memory');
    expect(classifyEventGroup('content.delta')).toBe('content');
    expect(classifyEventGroup('reasoning.snapshot')).toBe('reasoning');
    expect(classifyEventGroup('tool.result')).toBe('tool');
    expect(classifyEventGroup('action.start')).toBe('action');
    expect(classifyEventGroup('plan.update')).toBe('plan');
    expect(classifyEventGroup('task.start')).toBe('task');
    expect(classifyEventGroup('artifact.publish')).toBe('artifact');
  });

  it('keeps debug.postCall as an unrecognized group', () => {
    expect(classifyEventGroup('debug.postCall')).toBe('');
  });
});

describe('getEventRowGroupClass', () => {
  it('maps unrecognized event types to the neutral row class', () => {
    expect(getEventRowGroupClass('debug.postCall')).toBe(
      'event-group-unrecognized',
    );
  });

  it('keeps recognized event types on their existing group class', () => {
    expect(getEventRowGroupClass('request.query')).toBe('event-group-request');
  });
});

describe('getEventId', () => {
  it('uses runId for artifact.publish events', () => {
    expect(getEventId({
      type: 'artifact.publish',
      chatId: 'chat_1',
      runId: 'run_1',
      artifacts: [],
    })).toBe('run_1');
  });
});

describe('shouldDisplayDebugEvent', () => {
  it('hides events explicitly marked as hidden from the debug panel', () => {
    const event = {
      type: 'chat.updated',
    };
    markDebugEventHidden(event);
    expect(shouldDisplayDebugEvent(event)).toBe(false);
  });

  it('keeps unmarked websocket stream events visible in the debug panel', () => {
    expect(
      shouldDisplayDebugEvent({
        type: 'request.query',
      }),
    ).toBe(true);
  });

  it('keeps replayed events without transport metadata visible', () => {
    expect(
      shouldDisplayDebugEvent({
        type: 'run.complete',
      }),
    ).toBe(true);
  });
});

describe('resolveDebugEventTarget', () => {
  const timelineNodes = new Map([
    [
      'user_req_1',
      { id: 'user_req_1', kind: 'message', role: 'user', ts: 1000, text: 'hi' },
    ],
    [
      'content_1',
      { id: 'content_1', kind: 'content', ts: 1200, contentId: 'content_a', text: 'answer' },
    ],
    [
      'thinking_1',
      { id: 'thinking_1', kind: 'thinking', ts: 1150, text: 'thinking' },
    ],
    [
      'tool_1',
      { id: 'tool_1', kind: 'tool', ts: 1180, toolId: 'tool_a', text: 'tool' },
    ],
    [
      'task_node_1',
      { id: 'task_node_1', kind: 'content', ts: 1300, taskId: 'task_a', text: 'task output' },
    ],
  ]);
  const timelineOrder = ['user_req_1', 'thinking_1', 'tool_1', 'content_1', 'task_node_1'];

  it('maps content events through contentNodeById first', () => {
    expect(
      resolveDebugEventTarget(
        { type: 'content.delta', contentId: 'content_a', timestamp: 1201 },
        {
          contentNodeById: new Map([['content_a', 'content_1']]),
          reasoningNodeById: new Map(),
          toolNodeById: new Map(),
          timelineNodes,
          timelineOrder,
        },
      ),
    ).toEqual({ kind: 'node', id: 'content_1' });
  });

  it('maps reasoning and tool events through their existing node maps', () => {
    expect(
      resolveDebugEventTarget(
        { type: 'reasoning.delta', reasoningId: 'reasoning_a', timestamp: 1151 },
        {
          contentNodeById: new Map(),
          reasoningNodeById: new Map([['reasoning_a', 'thinking_1']]),
          toolNodeById: new Map(),
          timelineNodes,
          timelineOrder,
        },
      ),
    ).toEqual({ kind: 'node', id: 'thinking_1' });

    expect(
      resolveDebugEventTarget(
        { type: 'tool.start', toolId: 'tool_a', timestamp: 1181 },
        {
          contentNodeById: new Map(),
          reasoningNodeById: new Map(),
          toolNodeById: new Map([['tool_a', 'tool_1']]),
          timelineNodes,
          timelineOrder,
        },
      ),
    ).toEqual({ kind: 'node', id: 'tool_1' });
  });

  it('maps task events to task anchors', () => {
    expect(
      resolveDebugEventTarget(
        { type: 'task.start', taskId: 'task_a', timestamp: 1301 },
        {
          contentNodeById: new Map(),
          reasoningNodeById: new Map(),
          toolNodeById: new Map(),
          timelineNodes,
          timelineOrder,
        },
      ),
    ).toEqual({ kind: 'task', id: 'task_a' });
  });

  it('maps request-like events to user request node ids when present', () => {
    expect(
      resolveDebugEventTarget(
        { type: 'debug.preCall', requestId: 'req_1', timestamp: 1002 },
        {
          contentNodeById: new Map(),
          reasoningNodeById: new Map(),
          toolNodeById: new Map(),
          timelineNodes,
          timelineOrder,
        },
      ),
    ).toEqual({ kind: 'node', id: 'user_req_1' });
  });

  it('falls back to the closest timeline node by timestamp', () => {
    expect(
      resolveDebugEventTarget(
        { type: 'run.complete', timestamp: 1190 },
        {
          contentNodeById: new Map(),
          reasoningNodeById: new Map(),
          toolNodeById: new Map(),
          timelineNodes,
          timelineOrder,
        },
      ),
    ).toEqual({ kind: 'node', id: 'tool_1' });
  });
});
