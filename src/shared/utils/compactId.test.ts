import { createCompactId, resetCompactIdStateForTests } from '@/shared/utils/compactId';

describe('compactId', () => {
  beforeEach(() => {
    resetCompactIdStateForTests();
  });

  it('increments within the same second across prefixes', () => {
    const second = 1_776_474_697;
    const baseMs = second * 1000;

    expect(createCompactId('req', { nowMs: baseMs + 100 })).toBe(
      `req_${(second * 1000).toString(36)}`,
    );
    expect(createCompactId('wss', { nowMs: baseMs + 200 })).toBe(
      `wss_${(second * 1000 + 1).toString(36)}`,
    );
    expect(createCompactId('upload', { nowMs: baseMs + 300 })).toBe(
      `upload_${(second * 1000 + 2).toString(36)}`,
    );
  });

  it('resets the counter when the second changes', () => {
    expect(createCompactId('req', { nowMs: 2_500 })).toBe(
      `req_${(2_000).toString(36)}`,
    );
    expect(createCompactId('wss', { nowMs: 2_999 })).toBe(
      `wss_${(2_001).toString(36)}`,
    );
    expect(createCompactId('req', { nowMs: 3_000 })).toBe(
      `req_${(3_000).toString(36)}`,
    );
  });

  it('normalizes prefixes and falls back when empty', () => {
    expect(createCompactId(' req__ ', { nowMs: 5_000 })).toBe(
      `req_${(5_000).toString(36)}`,
    );
    expect(createCompactId('___', { nowMs: 6_000 })).toBe(
      `id_${(6_000).toString(36)}`,
    );
  });

  it('throws when more than 1000 ids are requested in the same second', () => {
    const secondMs = 10_000;
    for (let index = 0; index < 1000; index += 1) {
      createCompactId(`req${index % 2}`, { nowMs: secondMs + 500 });
    }

    expect(() =>
      createCompactId('req', {
        nowMs: secondMs + 999,
        overflowMessage: 'too many ids',
      }),
    ).toThrow('too many ids');
  });
});
