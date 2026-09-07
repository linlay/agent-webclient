import { canSubmitCompact, resolveCompactPhase } from './contextCompact';
import type { AgentEvent } from '@/shared/contracts/agentEvents';

const event = (type: string, rest: Record<string, unknown> = {}) => ({ type, chatId: 'a', runId: 'r', cycleId: 'cycle', compactId: 'l1', level: 'l1_tools', ...rest } as AgentEvent);

describe('compact cycle state', () => {
  it('keeps L1→L2 pending and handles replay and duplicates', () => {
    const events = [event('context.compact.start'), event('context.compact.complete', { cycleComplete: false })];
    expect(resolveCompactPhase(events, 'a')?.level).toBe('summary');
    events.push(event('context.compact.start')); // late L1 start cannot regress L2
    expect(resolveCompactPhase(events, 'a')?.level).toBe('summary');
    events.push(event('context.compact.start', { compactId: 'l2', level: 'summary' }));
    expect(resolveCompactPhase(events, 'a')?.level).toBe('summary');
    events.push(event('context.compact.complete', { compactId: 'l2', level: 'summary', cycleComplete: true }));
    events.push(event('context.compact.start')); // delayed duplicate cannot reopen a closed cycle
    expect(resolveCompactPhase(events, 'a')).toBeNull();
  });
  it('isolates chats and clears failed/interrupted cycles', () => {
    expect(resolveCompactPhase([event('context.compact.start')], 'b')).toBeNull();
    for (const terminal of ['context.compact.failed', 'run.cancel', 'run.error', 'run.complete']) {
      expect(resolveCompactPhase([event('context.compact.start'), event(terminal)], 'a')).toBeNull();
    }
  });
  it('treats legacy complete events as terminal', () => {
    expect(resolveCompactPhase([event('context.compact.start', { cycleId: undefined }), event('context.compact.complete', { cycleId: undefined })], 'a')).toBeNull();
  });
  it('does not reopen a completed run on a late compact start', () => {
    expect(resolveCompactPhase([event('run.complete'), event('context.compact.start')], 'a')).toBeNull();
  });
  it('shares entry eligibility for active native and unsupported runs', () => {
    expect(canSubmitCompact('a', true, true, false)).toBe(true);
    expect(canSubmitCompact('a', true, false, false)).toBe(false);
    expect(canSubmitCompact('a', false, true, true)).toBe(false);
    expect(canSubmitCompact('', false, true, false)).toBe(false);
  });
});
