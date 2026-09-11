import { buildLoadedChatUsageSnapshot } from './conversationPayload';

const timestamp = 1_710_000_000_000;
const usage = { type: 'usage.snapshot', chatId: 'a', runId: 'r', timestamp, contextWindow: { currentSize: 9000, maxSize: 10000 } };
const compact = { type: 'context.compact.complete', chatId: 'a', runId: 'r', timestamp, compactId: 'cp', postCompactEstimatedTokens: 4500 };

describe('compact replay usage ordering', () => {
  it('uses event order even when timestamps are equal', () => {
    expect(buildLoadedChatUsageSnapshot('a', { events: [usage, compact] })?.contextWindow?.currentSize).toBe(4500);
    expect(buildLoadedChatUsageSnapshot('a', { events: [compact, usage] })?.contextWindow?.currentSize).toBe(9000);
  });
  it('does not overwrite another chat or a newer run', () => {
    expect(buildLoadedChatUsageSnapshot('a', { events: [usage, { ...compact, chatId: 'b' }] })?.contextWindow?.currentSize).toBe(9000);
    expect(buildLoadedChatUsageSnapshot('a', { events: [usage, { ...compact, runId: 'old' }] })?.contextWindow?.currentSize).toBe(9000);
  });
  it('orders unsorted legacy exports, using seq before timestamps', () => {
    expect(buildLoadedChatUsageSnapshot('a', { events: [{ ...compact, timestamp: timestamp + 10 }, usage] })?.contextWindow?.currentSize).toBe(4500);
    expect(buildLoadedChatUsageSnapshot('a', { events: [{ ...compact, seq: 2 }, { ...usage, seq: 1, timestamp: timestamp + 10 }] })?.contextWindow?.currentSize).toBe(4500);
  });
});
