import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildSidebarSettingsMenuSections,
  resolveSettingsSummaryBadges,
  SidebarSettingsMenu,
} from "@/app/layout/sidebar/SidebarSettingsMenu";

const globalWithFeatureFlags = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("resolveSettingsSummaryBadges", () => {
  it("returns compact badge for theme", () => {
    expect(
      resolveSettingsSummaryBadges({
        themeMode: "dark",
      }),
    ).toEqual([
      expect.objectContaining({
        key: "theme",
        icon: "dark_mode",
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

  it("orders centers, registry config, memory, archive, then settings", () => {
    const sections = buildSidebarSettingsMenuSections();

    expect(sections.map((section) => section.title)).toEqual(["设置"]);
    expect(sections[0]?.items.map((item) => item.label)).toEqual([
      "技能中心",
      "连接器中心",
      "注册配置",
      "记忆管理",
      "知识库中心",
      "已归档对话",
      "设置",
    ]);
  });

  it("shows Markdown management without the retired memory flag", () => {
    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {};
    const sections = buildSidebarSettingsMenuSections();
    const labels = sections[0]?.items.map((item) => item.label) || [];
    expect(labels).toContain("记忆管理");
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
    expect(html).toContain("技能中心");
    expect(html).toContain("设置");
    expect(html).toContain("注册配置");
    expect(html).toContain("连接器中心");
    expect(html).toContain("记忆管理");
    expect(html).toContain("已归档对话");
    expect(html).toContain("sidebar-settings-item ui-icon-hover-24");
    expect(html).toContain("sidebar-settings-item-icon ui-icon-hover-24-target");
    expect(html).not.toContain("管理 registry YAML 配置。");
    expect(html).not.toContain("编辑技能目录");
    expect(html).not.toContain("查看已归档对话");
    expect(html).not.toContain("当前连接状态");
  });
});
