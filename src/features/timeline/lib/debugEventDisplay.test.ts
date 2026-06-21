import {
  appendVisibleDebugEvent,
  classifyEventGroup,
  getEventId,
  getEventRowGroupClass,
  markDebugEventHidden,
  resolveDebugEventTarget,
  shouldDisplayDebugEvent,
} from '@/features/timeline/lib/debugEventDisplay';
import type { AgentEvent } from '@/app/state/types';

const globalWithRuntimeConfig = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

beforeEach(() => {
  delete globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
});

describe('classifyEventGroup', () => {
  it('maps event types into dedicated debug color groups', () => {
    expect(classifyEventGroup('request.query')).toBe('request');
    expect(classifyEventGroup('request.steer')).toBe('request');
    expect(classifyEventGroup('chat.loaded')).toBe('chat');
    expect(classifyEventGroup('run.start')).toBe('run');
    expect(classifyEventGroup('awaiting.ask')).toBe('awaiting');
    expect(classifyEventGroup('awaiting.asking')).toBe('awaiting');
    expect(classifyEventGroup('memory.context')).toBe('memory');
    expect(classifyEventGroup('content.delta')).toBe('content');
    expect(classifyEventGroup('reasoning.snapshot')).toBe('reasoning');
    expect(classifyEventGroup('planning.snapshot')).toBe('planning');
    expect(classifyEventGroup('plan.update')).toBe('plan');
    expect(classifyEventGroup('tool.result')).toBe('tool');
    expect(classifyEventGroup('action.start')).toBe('action');
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

  it('keeps non-delta stream events visible in the debug panel', () => {
    expect(
      shouldDisplayDebugEvent({
        type: 'request.query',
      }),
    ).toBe(true);
  });

  it('hides stream delta events unless delta logs are enabled', () => {
    expect(
      shouldDisplayDebugEvent({
        type: 'content.delta',
      }),
    ).toBe(false);

    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DELTA_LOGS_ENABLED: 'true',
    };

    expect(
      shouldDisplayDebugEvent({
        type: 'content.delta',
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

  it('collapses streamed tool events into a snapshot when delta logs are disabled', () => {
    const rawEvents = [
      {
        type: 'tool.start',
        toolId: 'tool_1',
        toolName: 'demo.run',
        toolLabel: 'Demo',
        toolType: 'shell',
        viewportKey: 'viewport_demo',
        toolDescription: 'Run demo',
        runId: 'run_1',
        taskId: 'task_1',
        timestamp: 10,
      },
      {
        type: 'tool.args',
        toolId: 'tool_1',
        delta: '{"foo"',
        timestamp: 11,
      },
      {
        type: 'tool.args',
        toolId: 'tool_1',
        delta: ':"bar"}',
        timestamp: 12,
      },
      {
        type: 'tool.end',
        toolId: 'tool_1',
        timestamp: 13,
      },
    ];

    const debugEvents = rawEvents.reduce(
      (events, event, index) =>
        appendVisibleDebugEvent(events, event, 100, rawEvents.slice(0, index + 1)),
      [] as AgentEvent[],
    );

    expect(debugEvents).toEqual([
      expect.objectContaining({
        type: 'tool.snapshot',
        toolId: 'tool_1',
        toolName: 'demo.run',
        toolLabel: 'Demo',
        toolType: 'shell',
        viewportKey: 'viewport_demo',
        toolDescription: 'Run demo',
        runId: 'run_1',
        taskId: 'task_1',
        arguments: '{"foo":"bar"}',
        timestamp: 13,
      }),
    ]);
  });

  it('collapses streamed content events into a snapshot when delta logs are disabled', () => {
    const rawEvents = [
      {
        type: 'content.start',
        contentId: 'content_1',
        text: 'Hello',
        runId: 'run_1',
        timestamp: 10,
      },
      {
        type: 'content.delta',
        contentId: 'content_1',
        delta: ' world',
        timestamp: 11,
      },
      {
        type: 'content.end',
        contentId: 'content_1',
        text: 'Final text',
        timestamp: 12,
      },
    ];

    const debugEvents = rawEvents.reduce(
      (events, event, index) =>
        appendVisibleDebugEvent(events, event, 100, rawEvents.slice(0, index + 1)),
      [] as AgentEvent[],
    );

    expect(debugEvents).toEqual([
      expect.objectContaining({
        type: 'content.snapshot',
        contentId: 'content_1',
        runId: 'run_1',
        text: 'Final text',
        timestamp: 12,
      }),
    ]);
  });

  it('collapses streamed reasoning events into a snapshot when delta logs are disabled', () => {
    const rawEvents = [
      {
        type: 'reasoning.start',
        reasoningId: 'reasoning_1',
        reasoningLabel: 'Thinking',
        text: 'A',
        runId: 'run_1',
        timestamp: 10,
      },
      {
        type: 'reasoning.delta',
        reasoningId: 'reasoning_1',
        delta: 'B',
        timestamp: 11,
      },
      {
        type: 'reasoning.end',
        reasoningId: 'reasoning_1',
        timestamp: 12,
      },
    ];

    const debugEvents = rawEvents.reduce(
      (events, event, index) =>
        appendVisibleDebugEvent(events, event, 100, rawEvents.slice(0, index + 1)),
      [] as AgentEvent[],
    );

    expect(debugEvents).toEqual([
      expect.objectContaining({
        type: 'reasoning.snapshot',
        reasoningId: 'reasoning_1',
        reasoningLabel: 'Thinking',
        runId: 'run_1',
        text: 'AB',
        timestamp: 12,
      }),
    ]);
  });

  it('collapses streamed planning events into a snapshot when delta logs are disabled', () => {
    const rawEvents = [
      {
        type: 'planning.start',
        planningId: 'planning_1',
        planningLabel: 'Plan',
        text: 'Step',
        runId: 'run_1',
        timestamp: 10,
      },
      {
        type: 'planning.delta',
        planningId: 'planning_1',
        delta: ' one',
        timestamp: 11,
      },
      {
        type: 'planning.end',
        planningId: 'planning_1',
        timestamp: 12,
      },
    ];

    const debugEvents = rawEvents.reduce(
      (events, event, index) =>
        appendVisibleDebugEvent(events, event, 100, rawEvents.slice(0, index + 1)),
      [] as AgentEvent[],
    );

    expect(debugEvents).toEqual([
      expect.objectContaining({
        type: 'planning.snapshot',
        planningId: 'planning_1',
        planningLabel: 'Plan',
        runId: 'run_1',
        text: 'Step one',
        timestamp: 12,
      }),
    ]);
  });

  it('prefers accumulated timeline text when raw planning events were truncated', () => {
    const rawEvents = [
      {
        type: 'planning.delta',
        planningId: 'planning_1',
        delta: 'tail',
        timestamp: 11,
      },
      {
        type: 'planning.end',
        planningId: 'planning_1',
        timestamp: 12,
      },
    ];

    const debugEvents = appendVisibleDebugEvent(
      [],
      rawEvents[1],
      100,
      rawEvents,
      {
        reasoningNodeById: new Map([['planning:planning_1', 'planning_0']]),
        timelineNodes: new Map([
          [
            'planning_0',
            {
              id: 'planning_0',
              kind: 'planning',
              text: 'full text from the beginning',
              ts: 10,
            },
          ],
        ]),
      },
    );

    expect(debugEvents).toEqual([
      expect.objectContaining({
        type: 'planning.snapshot',
        planningId: 'planning_1',
        text: 'full text from the beginning',
        timestamp: 12,
      }),
    ]);
  });

  it('keeps tool result visible after the synthesized tool snapshot', () => {
    const rawEvents = [
      { type: 'tool.start', toolId: 'tool_1', toolName: 'demo.run' },
      { type: 'tool.args', toolId: 'tool_1', delta: '{"foo":"bar"}' },
      { type: 'tool.end', toolId: 'tool_1', timestamp: 13 },
      { type: 'tool.result', toolId: 'tool_1', result: 'ok', timestamp: 14 },
    ];

    const debugEvents = rawEvents.reduce(
      (events, event, index) =>
        appendVisibleDebugEvent(events, event, 100, rawEvents.slice(0, index + 1)),
      [] as AgentEvent[],
    );

    expect(debugEvents.map((event) => event.type)).toEqual([
      'tool.snapshot',
      'tool.result',
    ]);
  });

  it('keeps streamed events uncollapsed when delta logs are enabled', () => {
    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DELTA_LOGS_ENABLED: 'true',
    };
    const rawEvents = [
      { type: 'content.start', contentId: 'content_1', text: 'hi' },
      { type: 'content.delta', contentId: 'content_1', delta: '!' },
      { type: 'content.end', contentId: 'content_1' },
      { type: 'reasoning.start', reasoningId: 'reasoning_1', text: 'think' },
      { type: 'reasoning.delta', reasoningId: 'reasoning_1', delta: 'ing' },
      { type: 'reasoning.end', reasoningId: 'reasoning_1' },
      { type: 'planning.start', planningId: 'planning_1', text: 'plan' },
      { type: 'planning.delta', planningId: 'planning_1', delta: 'ning' },
      { type: 'planning.end', planningId: 'planning_1' },
      { type: 'tool.start', toolId: 'tool_1', toolName: 'demo.run' },
      { type: 'tool.args', toolId: 'tool_1', delta: '{"foo":"bar"}' },
      { type: 'tool.end', toolId: 'tool_1', timestamp: 13 },
    ];

    const debugEvents = rawEvents.reduce(
      (events, event, index) =>
        appendVisibleDebugEvent(events, event, 100, rawEvents.slice(0, index + 1)),
      [] as AgentEvent[],
    );

    expect(debugEvents.map((event) => event.type)).toEqual([
      'content.start',
      'content.delta',
      'content.end',
      'reasoning.start',
      'reasoning.delta',
      'reasoning.end',
      'planning.start',
      'planning.delta',
      'planning.end',
      'tool.start',
      'tool.args',
      'tool.end',
    ]);
  });

  it('does not synthesize another snapshot when one is already present', () => {
    const rawEvents = [
      { type: 'tool.start', toolId: 'tool_1', toolName: 'demo.run' },
      { type: 'tool.snapshot', toolId: 'tool_1', arguments: '{"foo":"bar"}' },
      { type: 'tool.end', toolId: 'tool_1', timestamp: 13 },
    ];

    const debugEvents = rawEvents.reduce(
      (events, event, index) =>
        appendVisibleDebugEvent(events, event, 100, rawEvents.slice(0, index + 1)),
      [] as AgentEvent[],
    );

    expect(debugEvents.map((event) => event.type)).toEqual(['tool.snapshot']);
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
        { type: 'debug.llmChat', requestId: 'req_1', timestamp: 1002 },
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
