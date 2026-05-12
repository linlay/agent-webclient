import {
  isDebugPanelEnabled,
  isSettingsMenuEnabled,
  parseFeatureFlag,
} from "@/shared/config/featureFlags";

const globalWithFeatureFlags = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("featureFlags", () => {
  beforeEach(() => {
    delete globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
  });

  it("treats only true-like values as enabled", () => {
    expect(parseFeatureFlag("true")).toBe(true);
    expect(parseFeatureFlag(" TRUE ")).toBe(true);
    expect(parseFeatureFlag(true)).toBe(true);
    expect(parseFeatureFlag(" false ")).toBe(false);
    expect(parseFeatureFlag("")).toBe(false);
    expect(parseFeatureFlag(undefined)).toBe(false);
  });

  it("reads the debug panel flag from runtime config", () => {
    expect(isDebugPanelEnabled()).toBe(false);

    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      APP_DEBUG_PANEL_ENABLED: "true",
    };
    expect(isDebugPanelEnabled()).toBe(true);

    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      APP_DEBUG_PANEL_ENABLED: " false ",
    };
    expect(isDebugPanelEnabled()).toBe(false);
  });

  it("reads the settings menu flag from runtime config", () => {
    expect(isSettingsMenuEnabled()).toBe(false);

    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      APP_SETTINGS_MENU_ENABLED: true,
    };
    expect(isSettingsMenuEnabled()).toBe(true);

    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      APP_SETTINGS_MENU_ENABLED: "false",
    };
    expect(isSettingsMenuEnabled()).toBe(false);
  });
});
