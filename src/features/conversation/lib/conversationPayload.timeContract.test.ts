import {
  normalizeChatArtifactItems,
  normalizeLoadedChatEvents,
} from '@/features/conversation/lib/conversationPayload';

const EPOCH_MS = 1_710_000_000_000;

describe('chat detail time contract', () => {
  it('keeps only explicitly timestamped epoch-ms replay events', () => {
    const events = normalizeLoadedChatEvents([
      { type: 'content.delta', timestamp: EPOCH_MS, text: 'valid' },
      { type: 'content.delta', timestamp: String(EPOCH_MS), text: 'string' },
      { type: 'content.delta', timestamp: Math.floor(EPOCH_MS / 1000), text: 'seconds' },
      { type: 'content.delta', text: 'missing' },
      { type: 'content.delta', timestamp: EPOCH_MS + 1, createdAt: 'bad' },
    ]);

    expect(events).toEqual([
      { type: 'content.delta', timestamp: EPOCH_MS, text: 'valid' },
    ]);
  });

  it('keeps artifacts with missing or invalid timestamp fields', () => {
    expect(normalizeChatArtifactItems({
      items: [
        {
          artifactId: 'explicit',
          name: 'explicit.txt',
          url: 'https://example.test/explicit.txt',
          timestamp: EPOCH_MS,
        },
        {
          artifactId: 'no-timestamp',
          name: 'no-ts.txt',
          url: 'https://example.test/no-ts.txt',
        },
        {
          artifactId: 'extra-time-fields',
          name: 'extra.txt',
          url: 'https://example.test/extra.txt',
          timestamp: EPOCH_MS,
          updatedAt: 0,
          createdAt: 'bad',
        },
      ],
    })).toEqual([
      expect.objectContaining({ artifactId: 'explicit', timestamp: EPOCH_MS }),
      expect.objectContaining({ artifactId: 'no-timestamp', timestamp: 0 }),
      expect.objectContaining({ artifactId: 'extra-time-fields', timestamp: EPOCH_MS }),
    ]);
  });
});
