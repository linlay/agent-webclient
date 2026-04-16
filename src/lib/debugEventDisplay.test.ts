import { classifyEventGroup } from './debugEventDisplay';

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
});
