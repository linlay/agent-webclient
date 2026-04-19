import { shouldStartInitialWorkerRefresh } from '@/features/workers/hooks/useWorkerData';

describe('shouldStartInitialWorkerRefresh', () => {
  it('starts immediately for standalone pages once the first refresh has not started', () => {
    expect(shouldStartInitialWorkerRefresh({
      hasStarted: false,
      appMode: false,
      hasAccessToken: false,
    })).toBe(true);
    expect(shouldStartInitialWorkerRefresh({
      hasStarted: false,
      appMode: false,
      hasAccessToken: true,
    })).toBe(true);
  });

  it('does not auto refresh again after the initial refresh has started', () => {
    expect(shouldStartInitialWorkerRefresh({
      hasStarted: true,
      appMode: false,
      hasAccessToken: true,
    })).toBe(false);
  });

  it('waits for app-mode token hydration before the first fetch', () => {
    expect(shouldStartInitialWorkerRefresh({
      hasStarted: false,
      appMode: true,
      hasAccessToken: false,
    })).toBe(false);

    expect(shouldStartInitialWorkerRefresh({
      hasStarted: false,
      appMode: true,
      hasAccessToken: true,
    })).toBe(true);
  });

  it('keeps the first-fetch rule independent from websocket readiness', () => {
    expect(shouldStartInitialWorkerRefresh({
      hasStarted: false,
      appMode: false,
      hasAccessToken: true,
    })).toBe(true);
  });
});
