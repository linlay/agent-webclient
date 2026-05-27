import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import { RightSidebar } from "@/app/layout/sidebar/right/RightSidebar";

jest.mock("@/app/state/AppContext", () => {
  const actual = jest.requireActual("@/app/state/AppContext");
  return {
    ...actual,
    useAppDispatch: jest.fn(() => jest.fn()),
    useAppState: jest.fn(),
  };
});

jest.mock("antd", () => {
  const React = require("react");

  return {
    Tabs: ({ items = [], activeKey, className }: any) =>
      React.createElement(
        "div",
        { className, "data-active-key": activeKey },
        items.map((item: any) =>
          React.createElement(
            "section",
            { key: item.key, "data-tab-key": item.key },
            item.icon,
            item.label,
            item.children,
          ),
        ),
      ),
  };
});

jest.mock("@/app/layout/sidebar/right/OverviewTab", () => ({
  OverviewTab: () => React.createElement("div", null, "overview tab"),
}));

jest.mock("@/app/layout/sidebar/right/DebugTab", () => ({
  DebugTab: () => React.createElement("div", null, "debug tab"),
}));

jest.mock("@/app/layout/sidebar/right/AttachmentPreviewPanel", () => ({
  AttachmentPreviewPanel: () => React.createElement("div", null, "preview tab"),
}));

const { useAppState } = jest.requireMock("@/app/state/AppContext") as {
  useAppState: jest.Mock;
};

const globalWithFeatureFlags = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
  localStorage?: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };
};

describe("RightSidebar", () => {
  const originalLocalStorage = globalWithFeatureFlags.localStorage;

  beforeEach(() => {
    delete globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
    globalWithFeatureFlags.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    useAppState.mockReturnValue({
      ...createInitialState(),
      rightSidebarOpen: true,
      rightSidebarOpenTab: "debug",
    });
  });

  afterAll(() => {
    if (originalLocalStorage) {
      globalWithFeatureFlags.localStorage = originalLocalStorage;
      return;
    }
    delete globalWithFeatureFlags.localStorage;
  });

  it("does not render the debug tab by default", () => {
    const html = renderToStaticMarkup(React.createElement(RightSidebar));

    expect(html).toContain("概览");
    expect(html).not.toContain("调试");
    expect(html).not.toContain("debug tab");
  });

  it("renders the debug panel outside the tab list when enabled by env", () => {
    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DEBUG_PANEL_ENABLED: "true",
    };

    const html = renderToStaticMarkup(React.createElement(RightSidebar));

    expect(html).not.toContain("调试");
    expect(html).toContain("debug tab");
  });
});
