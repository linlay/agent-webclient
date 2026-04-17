import { shouldStartInitialWorkerRefresh } from './useWorkerData';

describe('shouldStartInitialWorkerRefresh', () => {
  it('starts immediately for non-ws transport before the first fetch', () => {
    expect(shouldStartInitialWorkerRefresh({
      transportMode: 'sse',
      wsStatus: 'disconnected',
      hasStarted: false,
    })).toBe(true);
  });

  it('waits for websocket connection before auto refresh in ws mode', () => {
    expect(shouldStartInitialWorkerRefresh({
      transportMode: 'ws',
      wsStatus: 'disconnected',
      hasStarted: false,
    })).toBe(false);
    expect(shouldStartInitialWorkerRefresh({
      transportMode: 'ws',
      wsStatus: 'connecting',
      hasStarted: false,
    })).toBe(false);
    expect(shouldStartInitialWorkerRefresh({
      transportMode: 'ws',
      wsStatus: 'error',
      hasStarted: false,
    })).toBe(false);
    expect(shouldStartInitialWorkerRefresh({
      transportMode: 'ws',
      wsStatus: 'connected',
      hasStarted: false,
    })).toBe(true);
  });

  it('does not auto refresh again after the initial refresh has started', () => {
    expect(shouldStartInitialWorkerRefresh({
      transportMode: 'ws',
      wsStatus: 'connected',
      hasStarted: true,
    })).toBe(false);
    expect(shouldStartInitialWorkerRefresh({
      transportMode: 'sse',
      wsStatus: 'disconnected',
      hasStarted: true,
    })).toBe(false);
  });

  it('matches the intended first-load sequence for websocket mode', () => {
    let hasStarted = false;

    expect(shouldStartInitialWorkerRefresh({
      transportMode: 'ws',
      wsStatus: 'disconnected',
      hasStarted,
    })).toBe(false);

    expect(shouldStartInitialWorkerRefresh({
      transportMode: 'ws',
      wsStatus: 'connected',
      hasStarted,
    })).toBe(true);
    hasStarted = true;

    expect(shouldStartInitialWorkerRefresh({
      transportMode: 'ws',
      wsStatus: 'connected',
      hasStarted,
    })).toBe(false);
  });
});
