import type { AgentEvent } from '@/shared/contracts/agentEvents';
import { normalizePublishedArtifacts } from '@/features/events/lib/processors/eventProcessorShared';
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


describe('artifact publication time parity', () => {
  const artifact = { artifactId: 'artifact-1', name: 'result.html', url: 'artifacts/run-1/result.html' };

  it('restores the same timestamp and resource as the live publication', () => {
    const live = normalizePublishedArtifacts({
      type: 'artifact.publish', timestamp: EPOCH_MS, artifacts: [artifact],
    } as AgentEvent);
    const history = normalizeChatArtifactItems({ items: [{ ...artifact, publishedAt: EPOCH_MS }] });
    expect(history).toEqual(live.map(item => ({ ...item, source: 'chat' })));
  });

  it('prefers publishedAt over the legacy timestamp', () => {
    expect(normalizeChatArtifactItems({ items: [{
      ...artifact, publishedAt: EPOCH_MS, timestamp: EPOCH_MS + 1,
    }] })?.[0].timestamp).toBe(EPOCH_MS);
  });

  it.each([undefined, null, 0, -1, EPOCH_MS / 1000, String(EPOCH_MS), NaN, Infinity, EPOCH_MS + 0.5])(
    'keeps the artifact without a display time for invalid publishedAt %s', publishedAt => {
      expect(normalizeChatArtifactItems({ items: [{ ...artifact, publishedAt }] })).toEqual([
        expect.objectContaining({ artifactId: artifact.artifactId, timestamp: 0 }),
      ]);
    },
  );

  it('accepts a valid legacy timestamp when publishedAt is invalid', () => {
    expect(normalizeChatArtifactItems({ items: [{
      ...artifact, publishedAt: 0, timestamp: EPOCH_MS,
    }] })?.[0].timestamp).toBe(EPOCH_MS);
  });
});
