import { APP_UI_BASE, isAppMode, isDesktopAppMode } from '@/shared/utils/routing';

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
  });

  it('keeps regular web paths out of app mode', () => {
    expect(isAppMode('/')).toBe(false);
    expect(isAppMode('/chat')).toBe(false);
    expect(isAppMode('')).toBe(false);
    expect(isAppMode('agent')).toBe(false);
  });

  it('does not enable app mode from the removed desktop auth URL parameter', () => {
    expect(
      Reflect.apply(isAppMode, undefined, [
        '/chat',
        '?desktopAuthContext=platform%3A1',
      ]),
    ).toBe(false);
  });

  it.each(["1", "yes", "TRUE ", false, 1, null])(
    "does not treat %p as DESKTOP_APP=true",
    (value) => {
      globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
        DESKTOP_APP: value,
      };
      expect(isDesktopAppMode()).toBe(false);
    },
  );

  it("accepts the boolean true value", () => {
    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DESKTOP_APP: true,
    };
    expect(isDesktopAppMode()).toBe(true);
  });
});
