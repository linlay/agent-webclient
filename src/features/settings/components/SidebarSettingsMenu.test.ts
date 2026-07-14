import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildSidebarSettingsMenuSections,
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

  it("includes skills, registry config, archive, settings, and memory info in order", () => {
    const sections = buildSidebarSettingsMenuSections({
      wsStatus: "error",
      wsErrorMessage: "握手失败",
    });

    expect(sections.map((section) => section.title)).toEqual(["设置"]);
    expect(sections[0]?.items.map((item) => item.label)).toEqual([
      "技能",
      "注册配置",
      "归档",
      "打开设置...",
      "记忆信息",
    ]);
  });

  it("hides memory info item when MEMORY_ENABLED is not set", () => {
    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {};
    const sections = buildSidebarSettingsMenuSections({});
    const labels = sections[0]?.items.map((item) => item.label) || [];
    expect(labels).not.toContain("记忆信息");
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
    expect(html).toContain("技能");
    expect(html).toContain("打开设置...");
    expect(html).toContain("注册配置");
    expect(html).toContain("记忆信息");
    expect(html).toContain("归档");
    expect(html).toContain("sidebar-settings-item ui-icon-hover-24");
    expect(html).toContain("sidebar-settings-item-icon ui-icon-hover-24-target");
    expect(html).not.toContain("管理 registry YAML 配置。");
    expect(html).not.toContain("编辑技能目录");
    expect(html).not.toContain("查看已归档会话");
    expect(html).not.toContain("当前连接状态");
  });
});
