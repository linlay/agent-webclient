import { describe, expect, it } from 'vitest';

import { formatChatTimeLabel, pickChatAgentLabel } from './chatListFormatter.js';

describe('chatListFormatter', () => {
  it('prefers firstAgentName over firstAgentKey', () => {
    expect(pickChatAgentLabel({ firstAgentName: 'Planner', firstAgentKey: 'planner' })).toBe('Planner');
    expect(pickChatAgentLabel({ firstAgentName: '   ', firstAgentKey: 'planner' })).toBe('planner');
    expect(pickChatAgentLabel({})).toBe('n/a');
  });

  it('formats time as HH:mm:ss for chats updated today', () => {
    const now = new Date('2026-02-26T17:30:10');
    const updated = '2026-02-26T07:08:09';
    expect(formatChatTimeLabel(updated, now)).toBe('07:08:09');
  });

  it('formats time as YYYY-MM-DD for historical chats', () => {
    const now = new Date('2026-02-26T17:30:10');
    const updated = '2026-02-20T23:08:09';
    expect(formatChatTimeLabel(updated, now)).toBe('2026-02-20');
  });

  it('returns -- for missing or invalid updatedAt', () => {
    expect(formatChatTimeLabel('', new Date('2026-02-26T17:30:10'))).toBe('--');
    expect(formatChatTimeLabel('not-a-date', new Date('2026-02-26T17:30:10'))).toBe('--');
  });
});
