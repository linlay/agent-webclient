import {
  hasValidDesktopPushTimeContract,
  readRequiredPlatformEventTimestamp,
} from '@/shared/utils/platformTime';

const EPOCH_MS = 1_710_000_000_000;

const VALID_PUSH_DATA: Record<string, Record<string, unknown>> = {
  connected: {},
  heartbeat: { timestamp: EPOCH_MS },
  'auth.expiring': { expiresAt: EPOCH_MS },
  'run.started': { startedAt: EPOCH_MS },
  'run.finished': { finishedAt: EPOCH_MS },
  'chat.created': { createdAt: EPOCH_MS },
  'chat.updated': { updatedAt: EPOCH_MS },
  'chat.unread': { createdAt: EPOCH_MS },
  'chat.read': { readAt: EPOCH_MS },
  'chat.read_all': {},
  'chat.deleted': {},
  'chat.renamed': {},
  'chat.archived': {},
  'archive.restored': {
    summary: {
      createdAt: EPOCH_MS,
      updatedAt: EPOCH_MS,
      lastRunAt: EPOCH_MS,
      archivedAt: EPOCH_MS,
      readAt: EPOCH_MS,
    },
  },
  'archive.deleted': {},
  'catalog.updated': { updatedAt: EPOCH_MS },
  'awaiting.asking': { createdAt: EPOCH_MS, timeout: 600_000 },
  'awaiting.answered': { answeredAt: EPOCH_MS, durationMs: 125 },
  'resource.pushed': { pushedAt: EPOCH_MS },
};

function validatesPush(type: string, data: Record<string, unknown>): boolean {
  return hasValidDesktopPushTimeContract({
    type,
    event: { type, ...data },
    frame: { frame: 'push', type, data },
  });
}

describe('Desktop WebSocket push time contract', () => {
  it.each(Object.entries(VALID_PUSH_DATA))(
    'accepts the %s semantic time payload',
    (type, data) => {
      expect(validatesPush(type, data)).toBe(true);
    },
  );

  it.each(
    Object.entries(VALID_PUSH_DATA).filter(([type]) => type !== 'heartbeat'),
  )('rejects legacy timestamp anywhere in %s', (type, data) => {
    const payload = { ...data, nested: { timestamp: EPOCH_MS } };
    expect(validatesPush(type, payload)).toBe(false);
  });

  it('requires heartbeat.timestamp and keeps it as the only permitted push timestamp', () => {
    expect(validatesPush('heartbeat', {})).toBe(false);
    expect(validatesPush('heartbeat', { timestamp: EPOCH_MS })).toBe(true);
    expect(validatesPush('heartbeat', { timestamp: String(EPOCH_MS) })).toBe(false);
  });

  it.each([
    ['chat.updated', 'updatedAt'],
    ['run.started', 'startedAt'],
    ['run.finished', 'finishedAt'],
    ['chat.unread', 'createdAt'],
    ['chat.read', 'readAt'],
    ['awaiting.answered', 'answeredAt'],
    ['resource.pushed', 'pushedAt'],
  ])('rejects missing, second, string, and floating %s.%s', (type, field) => {
    const data = VALID_PUSH_DATA[type];
    const withoutField = { ...data };
    delete withoutField[field];

    expect(validatesPush(type, withoutField)).toBe(false);
    expect(validatesPush(type, { ...data, [field]: Math.floor(EPOCH_MS / 1000) })).toBe(false);
    expect(validatesPush(type, { ...data, [field]: String(EPOCH_MS) })).toBe(false);
    expect(validatesPush(type, { ...data, [field]: EPOCH_MS + 0.5 })).toBe(false);
  });

  it('validates archive.restored summary times and keeps readAt optional there', () => {
    const archive = VALID_PUSH_DATA['archive.restored'];
    const summary = archive.summary as Record<string, unknown>;
    const withoutReadAt = { ...summary };
    delete withoutReadAt.readAt;

    expect(validatesPush('archive.restored', { summary: withoutReadAt })).toBe(true);
    expect(
      validatesPush('archive.restored', {
        summary: { ...summary, archivedAt: Math.floor(EPOCH_MS / 1000) },
      }),
    ).toBe(false);
    expect(
      validatesPush('archive.restored', {
        summary: { ...summary, readAt: String(EPOCH_MS) },
      }),
    ).toBe(false);
  });

  it('keeps awaiting timeout and durationMs as durations rather than instants', () => {
    expect(
      validatesPush('awaiting.asking', { createdAt: EPOCH_MS, timeout: 0 }),
    ).toBe(true);
    expect(
      validatesPush('awaiting.answered', { answeredAt: EPOCH_MS, durationMs: 0 }),
    ).toBe(true);
  });

  it('does not use replaced fields and rejects the legacy chat.restored type', () => {
    expect(
      validatesPush('chat.unread', {
        createdAt: EPOCH_MS,
        readAt: EPOCH_MS,
      }),
    ).toBe(false);
    expect(
      validatesPush('awaiting.answered', {
        resolvedAt: EPOCH_MS,
      }),
    ).toBe(false);
    expect(validatesPush('chat.restored', {})).toBe(false);
  });

  it('continues to require stream event.timestamp independently of push rules', () => {
    expect(
      readRequiredPlatformEventTimestamp({
        type: 'run.complete',
        timestamp: EPOCH_MS,
        finishedAt: EPOCH_MS,
      }),
    ).toBe(EPOCH_MS);
    expect(
      readRequiredPlatformEventTimestamp({ type: 'run.complete', finishedAt: EPOCH_MS }),
    ).toBeUndefined();
  });
});
