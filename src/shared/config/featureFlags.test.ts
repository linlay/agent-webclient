import {
  isDeltaLogsEnabled,
  isDebugPanelEnabled,
  isQuickActionsEnabled,
  isSettingsMenuEnabled,
  isVoiceEnabled,
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
      DEBUG_PANEL_ENABLED: "true",
    };
    expect(isDebugPanelEnabled()).toBe(true);

    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DEBUG_PANEL_ENABLED: " false ",
    };
    expect(isDebugPanelEnabled()).toBe(false);
  });

  it("reads the delta logs flag from runtime config", () => {
    expect(isDeltaLogsEnabled()).toBe(false);

    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DELTA_LOGS_ENABLED: "true",
    };
    expect(isDeltaLogsEnabled()).toBe(true);

    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DELTA_LOGS_ENABLED: "false",
    };
    expect(isDeltaLogsEnabled()).toBe(false);
  });

  it("reads the settings menu flag from runtime config", () => {
    expect(isSettingsMenuEnabled()).toBe(false);

    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      SETTINGS_MENU_ENABLED: true,
    };
    expect(isSettingsMenuEnabled()).toBe(true);

    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      SETTINGS_MENU_ENABLED: "false",
    };
    expect(isSettingsMenuEnabled()).toBe(false);
  });

  it("reads the quick actions flag from runtime config", () => {
    expect(isQuickActionsEnabled()).toBe(false);

    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      QUICK_ACTIONS_ENABLED: "true",
    };
    expect(isQuickActionsEnabled()).toBe(true);

    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      QUICK_ACTIONS_ENABLED: "false",
    };
    expect(isQuickActionsEnabled()).toBe(false);
  });

  it("reads the voice flag from runtime config", () => {
    expect(isVoiceEnabled()).toBe(false);

    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      VOICE_ENABLED: "true",
    };
    expect(isVoiceEnabled()).toBe(true);

    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      VOICE_ENABLED: "false",
    };
    expect(isVoiceEnabled()).toBe(false);
  });
});
