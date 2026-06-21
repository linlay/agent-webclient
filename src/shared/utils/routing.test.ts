import { APP_UI_BASE, isAppMode } from '@/shared/utils/routing';

const globalWithRuntimeConfig = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe('routing', () => {
  afterEach(() => {
    delete globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
  });

  it('detects app mode for host-marked root-mounted paths', () => {
    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DESKTOP_APP: 'true',
    };

    expect(isAppMode(APP_UI_BASE)).toBe(true);
    expect(isAppMode('/chat')).toBe(true);
    expect(isAppMode('/chat', '?desktopAuthContext=platform%3A1')).toBe(true);
  });

  it('keeps regular web paths out of app mode', () => {
    expect(isAppMode('/')).toBe(false);
    expect(isAppMode('/chat')).toBe(false);
    expect(isAppMode('')).toBe(false);
    expect(isAppMode('agent')).toBe(false);
  });
});
