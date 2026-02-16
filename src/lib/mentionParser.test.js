import { describe, expect, it } from 'vitest';

import { parseLeadingAgentMention } from './mentionParser.js';

describe('mentionParser', () => {
  const agents = [
    { key: 'demoAgent', name: 'Demo Agent' },
    { key: 'plannerBot', name: 'Planner' }
  ];

  it('parses leading @agent and removes mention prefix', () => {
    const parsed = parseLeadingAgentMention('@demoAgent 你好', agents);

    expect(parsed.error).toBe('');
    expect(parsed.hasMention).toBe(true);
    expect(parsed.mentionAgentKey).toBe('demoAgent');
    expect(parsed.cleanMessage).toBe('你好');
  });

  it('returns original message when there is no mention', () => {
    const parsed = parseLeadingAgentMention('普通消息', agents);

    expect(parsed.error).toBe('');
    expect(parsed.hasMention).toBe(false);
    expect(parsed.mentionAgentKey).toBe('');
    expect(parsed.cleanMessage).toBe('普通消息');
  });

  it('returns error when mentioned agent does not exist', () => {
    const parsed = parseLeadingAgentMention('@ghost hi', agents);

    expect(parsed.hasMention).toBe(true);
    expect(parsed.mentionAgentKey).toBe('');
    expect(parsed.error).toContain('unknown agent');
  });

  it('returns error for empty @ mention', () => {
    const parsed = parseLeadingAgentMention('@', agents);

    expect(parsed.hasMention).toBe(true);
    expect(parsed.error).toContain('empty');
    expect(parsed.cleanMessage).toBe('');
  });
});
