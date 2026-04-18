import {
  classifyEventGroup,
  getEventRowGroupClass,
  shouldDisplayDebugEvent,
} from './debugEventDisplay';

describe('classifyEventGroup', () => {
  it('maps event types into dedicated debug color groups', () => {
    expect(classifyEventGroup('request.query')).toBe('request');
    expect(classifyEventGroup('request.steer')).toBe('request');
    expect(classifyEventGroup('chat.loaded')).toBe('chat');
    expect(classifyEventGroup('run.start')).toBe('run');
    expect(classifyEventGroup('awaiting.ask')).toBe('awaiting');
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

describe('shouldDisplayDebugEvent', () => {
  it('hides websocket push events from the debug panel', () => {
    expect(
      shouldDisplayDebugEvent({
        type: 'chat.updated',
        transportFrame: 'push',
      }),
    ).toBe(false);
  });

  it('keeps websocket stream events visible in the debug panel', () => {
    expect(
      shouldDisplayDebugEvent({
        type: 'request.query',
        transportFrame: 'stream',
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
