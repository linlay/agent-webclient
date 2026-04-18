import { shouldStartInitialWorkerRefresh } from '@/features/workers/hooks/useWorkerData';

describe('shouldStartInitialWorkerRefresh', () => {
  it('waits for websocket connection before the first fetch', () => {
    expect(shouldStartInitialWorkerRefresh({
      wsStatus: 'disconnected',
      hasStarted: false,
    })).toBe(false);
    expect(shouldStartInitialWorkerRefresh({
      wsStatus: 'connecting',
      hasStarted: false,
    })).toBe(false);
    expect(shouldStartInitialWorkerRefresh({
      wsStatus: 'error',
      hasStarted: false,
    })).toBe(false);
    expect(shouldStartInitialWorkerRefresh({
      wsStatus: 'connected',
      hasStarted: false,
    })).toBe(true);
  });

  it('does not auto refresh again after the initial refresh has started', () => {
    expect(shouldStartInitialWorkerRefresh({
      wsStatus: 'connected',
      hasStarted: true,
    })).toBe(false);
  });

  it('matches the intended first-load sequence for websocket mode', () => {
    let hasStarted = false;

    expect(shouldStartInitialWorkerRefresh({
      wsStatus: 'disconnected',
      hasStarted,
    })).toBe(false);

    expect(shouldStartInitialWorkerRefresh({
      wsStatus: 'connected',
      hasStarted,
    })).toBe(true);
    hasStarted = true;

    expect(shouldStartInitialWorkerRefresh({
      wsStatus: 'connected',
      hasStarted,
    })).toBe(false);
  });
});
