import { classifyEventGroup } from './debugEventDisplay';

describe('classifyEventGroup', () => {
  it('maps event types into dedicated debug color groups', () => {
    expect(classifyEventGroup('request.query')).toBe('chat');
    expect(classifyEventGroup('request.steer')).toBe('chat');
    expect(classifyEventGroup('request.remember')).toBe('chat');
    expect(classifyEventGroup('request.learn')).toBe('chat');
    expect(classifyEventGroup('chat.loaded')).toBe('chat');
    expect(classifyEventGroup('run.start')).toBe('run');
    expect(classifyEventGroup('content.delta')).toBe('content');
    expect(classifyEventGroup('reasoning.snapshot')).toBe('reasoning');
    expect(classifyEventGroup('tool.result')).toBe('tool');
    expect(classifyEventGroup('action.start')).toBe('action');
    expect(classifyEventGroup('plan.update')).toBe('plan');
  });
});
