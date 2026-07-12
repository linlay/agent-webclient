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

  it('does not infer artifact timestamp from createdAt or updatedAt', () => {
    expect(normalizeChatArtifactItems({
      items: [
        {
          artifactId: 'explicit',
          name: 'explicit.txt',
          url: 'https://example.test/explicit.txt',
          timestamp: EPOCH_MS,
          createdAt: EPOCH_MS - 1,
        },
        {
          artifactId: 'fallback-only',
          name: 'fallback.txt',
          url: 'https://example.test/fallback.txt',
          createdAt: EPOCH_MS,
        },
        {
          artifactId: 'invalid-extra-time',
          name: 'invalid.txt',
          url: 'https://example.test/invalid.txt',
          timestamp: EPOCH_MS,
          updatedAt: 0,
        },
      ],
    })).toEqual([
      expect.objectContaining({ artifactId: 'explicit', timestamp: EPOCH_MS }),
    ]);
  });
});
