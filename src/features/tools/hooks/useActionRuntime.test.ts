import { shouldSkipHistoricalActionBatch } from '@/features/tools/hooks/useActionRuntime';

describe('shouldSkipHistoricalActionBatch', () => {
  it('skips hydrated history events during non-streaming chat load', () => {
    expect(shouldSkipHistoricalActionBatch({
      eventCursor: 0,
      eventsLength: 12,
      streaming: false,
    })).toBe(true);
  });

  it('does not skip live action events while streaming', () => {
    expect(shouldSkipHistoricalActionBatch({
      eventCursor: 12,
      eventsLength: 13,
      streaming: true,
    })).toBe(false);
  });
});
