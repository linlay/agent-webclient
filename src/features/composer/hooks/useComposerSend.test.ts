import {
  buildCompactUsageSnapshot,
  latestUsageSnapshotFromEvents,
} from '@/features/composer/hooks/useComposerSend';
import type { AIUsageSnapshotEvent } from '@/app/state/types';

describe('compact usage snapshot helpers', () => {
  it('updates context window size from compact response while preserving usage stats', () => {
    const previous: AIUsageSnapshotEvent = {
      type: 'usage.snapshot',
      chatId: 'chat-1',
      runId: 'run-1',
      model: { key: 'minimax' },
      contextWindow: {
        maxSize: 128000,
        currentSize: 13157,
        estimatedNextCallSize: 13367,
      },
      usage: {
        current: {
          promptTokens: 13157,
          completionTokens: 210,
          totalTokens: 13367,
        },
        run: {
          promptTokens: 13157,
          completionTokens: 210,
          totalTokens: 13367,
          llmChatCompletionCount: 1,
        },
      },
    };

    const snapshot = buildCompactUsageSnapshot({
      accepted: true,
      status: 'compacted',
      chatId: 'chat-1',
      compactId: 'compact-1',
      postCompactEstimatedTokens: 5396,
    }, previous);

    expect(snapshot).toEqual({
      ...previous,
      contextWindow: {
        maxSize: 128000,
        currentSize: 5396,
        estimatedNextCallSize: 5396,
      },
    });
  });

  it('finds the latest usage snapshot in event history for manual compact fallback', () => {
    const older: AIUsageSnapshotEvent = {
      type: 'usage.snapshot',
      chatId: 'chat-1',
      runId: 'run-1',
      contextWindow: {
        maxSize: 128000,
        currentSize: 9000,
      },
    };
    const latest: AIUsageSnapshotEvent = {
      type: 'usage.snapshot',
      chatId: 'chat-1',
      runId: 'run-2',
      contextWindow: {
        maxSize: 128000,
        currentSize: 7733,
      },
    };

    expect(latestUsageSnapshotFromEvents([
      older,
      { type: 'content.delta', text: 'ignored' },
      latest,
    ])).toBe(latest);
  });
});
