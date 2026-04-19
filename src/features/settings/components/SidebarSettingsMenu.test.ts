import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildSidebarSettingsMenuSections,
  dispatchSidebarSettingsAction,
  resolveSettingsSummaryBadges,
  SidebarSettingsMenu,
} from "@/features/settings/components/SidebarSettingsMenu";

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
  it("includes quick actions, full settings entry, and reserved items", () => {
    const sections = buildSidebarSettingsMenuSections({
      wsStatus: "error",
      wsErrorMessage: "握手失败",
    });

    expect(sections.map((section) => section.title)).toEqual(["设置", "预留"]);
    expect(sections[0]?.items[0]?.description).toContain("握手失败");
    expect(sections[1]?.items.every((item) => item.disabled)).toBe(true);
  });
});

describe("dispatchSidebarSettingsAction", () => {
  it("dispatches open-settings and ignores placeholders", () => {
    const dispatch = jest.fn();

    expect(
      dispatchSidebarSettingsAction({ type: "open-settings" }, dispatch),
    ).toBe(true);
    expect(dispatchSidebarSettingsAction({ type: "noop" }, dispatch)).toBe(
      false,
    );

    expect(dispatch.mock.calls).toEqual([
      [{ type: "SET_SETTINGS_OPEN", open: true }],
    ]);
  });
});

describe("SidebarSettingsMenu", () => {
  it("renders menu groups and reserved items", () => {
    const html = renderToStaticMarkup(
      React.createElement(SidebarSettingsMenu, {
        onAction: jest.fn(),
      }),
    );

    expect(html).toContain("设置菜单");
    expect(html).toContain("打开设置...");
    expect(html).toContain("连接设置（即将开放）");
    expect(html).toContain("外观偏好（即将开放）");
    expect(html).toContain("快捷键（即将开放）");
  });
});
