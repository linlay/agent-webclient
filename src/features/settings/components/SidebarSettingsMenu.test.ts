import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildSidebarSettingsMenuSections,
  dispatchSidebarSettingsAction,
  resolveSettingsSummaryBadges,
  SidebarSettingsMenu,
} from "@/features/settings/components/SidebarSettingsMenu";

const globalWithFeatureFlags = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("resolveSettingsSummaryBadges", () => {
  it("returns compact badges for transport and theme", () => {
    expect(
      resolveSettingsSummaryBadges({
        transportMode: "ws",
        themeMode: "dark",
        wsStatus: "connected",
      }),
    ).toEqual([
      expect.objectContaining({
        key: "transport",
        label: "WS",
      }),
      expect.objectContaining({
        key: "theme",
        label: "夜",
      }),
    ]);
  });
});

describe("buildSidebarSettingsMenuSections", () => {
  beforeEach(() => {
    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      MEMORY_ENABLED: 'true',
    };
  });

  afterEach(() => {
    delete globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
  });

  it("includes quick actions, full settings entry, and reserved items", () => {
    const sections = buildSidebarSettingsMenuSections({
      wsStatus: "error",
      wsErrorMessage: "握手失败",
    });

    expect(sections.map((section) => section.title)).toEqual(["设置"]);
    expect(sections[0]?.items[0]?.description).toContain("握手失败");
    expect(sections[0]?.items[1]?.label).toBe("记忆信息");
    expect(sections[0]?.items[2]?.label).toBe("归档");
  });

  it("hides memory info item when MEMORY_ENABLED is not set", () => {
    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {};
    const sections = buildSidebarSettingsMenuSections({});
    const labels = sections[0]?.items.map((item) => item.label) || [];
    expect(labels).not.toContain("记忆信息");
  });
});

describe("dispatchSidebarSettingsAction", () => {
  it("dispatches open-settings, open-memory-info, open-archive, and ignores placeholders", () => {
    const dispatch = jest.fn();

    expect(
      dispatchSidebarSettingsAction({ type: "open-settings" }, dispatch),
    ).toBe(true);
    expect(
      dispatchSidebarSettingsAction({ type: "open-memory-info" }, dispatch),
    ).toBe(true);
    expect(
      dispatchSidebarSettingsAction({ type: "open-archive" }, dispatch),
    ).toBe(true);
    expect(dispatchSidebarSettingsAction({ type: "noop" }, dispatch)).toBe(
      false,
    );

    expect(dispatch.mock.calls).toEqual([
      [{ type: "SET_SETTINGS_OPEN", open: true }],
      [{ type: "SET_MEMORY_INFO_OPEN", open: true }],
      [{ type: "SET_ARCHIVE_OPEN", open: true }],
    ]);
  });
});

describe("SidebarSettingsMenu", () => {
  beforeEach(() => {
    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      MEMORY_ENABLED: 'true',
    };
  });

  afterEach(() => {
    delete globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
  });

  it("renders menu groups and reserved items", () => {
    const html = renderToStaticMarkup(
      React.createElement(SidebarSettingsMenu, {
        onAction: jest.fn(),
      }),
    );

    expect(html).toContain("设置菜单");
    expect(html).toContain("打开设置...");
    expect(html).toContain("记忆信息");
    expect(html).toContain("归档");
  });
});
