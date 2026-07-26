import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import { RightSidebar } from "@/app/layout/sidebar/right/RightSidebar";
import { I18nProvider } from "@/shared/i18n";

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
  const mockTabsState: { current: any } = { current: null };

  return {
    __mockTabsState: mockTabsState,
    Flex: ({ children, gap, ...props }: any) =>
      React.createElement("div", { ...props, "data-gap": gap }, children),
    Typography: {
      Text: ({ children, ellipsis: _ellipsis, ...props }: any) =>
        React.createElement("span", props, children),
    },
    Tabs: (props: any) => {
      const { items = [], activeKey, className } = props;
      mockTabsState.current = props;
      return React.createElement(
        "div",
        { className, "data-active-key": activeKey },
        items.map((item: any) =>
          React.createElement(
            "section",
            {
              key: item.key,
              "data-tab-key": item.key,
              "data-closable": String(item.closable !== false),
            },
            item.icon,
            item.label,
            item.children,
          ),
        ),
      );
    },
  };
});

jest.mock("@/app/layout/sidebar/right/OverviewTab", () => ({
  OverviewTab: () => React.createElement("div", null, "overview tab"),
}));

jest.mock("@/app/layout/sidebar/right/DebugTab", () => ({
  DebugTab: () => React.createElement("div", null, "debug tab"),
}));

jest.mock("@/app/layout/sidebar/right/SourceDetailTab", () => ({
  SourceDetailTab: () => React.createElement("div", null, "source detail tab"),
}));

jest.mock("@/app/layout/sidebar/right/PlanningPreviewTab", () => ({
  PlanningPreviewTab: () => React.createElement("div", null, "planning preview tab"),
}));

jest.mock("@/features/artifacts/components/AttachmentPreviewPanel", () => ({
  AttachmentPreviewPanel: () => React.createElement("div", null, "preview tab"),
}));

jest.mock("@/features/web-preview/components/WebPreviewPanel", () => ({
  WebPreviewPanel: ({ preview }: any) =>
    React.createElement(
      "iframe",
      { src: preview.url, title: preview.title },
    ),
}));

jest.mock("@/features/btw/components/BtwTab", () => ({
  BtwTab: () => React.createElement("div", null, "btw tab"),
}));

jest.mock("@/features/btw/components/BtwProvider", () => ({
  useBTW: jest.fn(),
}));

const { useAppDispatch, useAppState } = jest.requireMock("@/app/state/AppContext") as {
  useAppDispatch: jest.Mock;
  useAppState: jest.Mock;
};
const { useBTW } = jest.requireMock(
  "@/features/btw/components/BtwProvider",
) as {
  useBTW: jest.Mock;
};
const { __mockTabsState: mockTabsState } = jest.requireMock("antd") as {
  __mockTabsState: { current: any };
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
  const dispatch = jest.fn();
  const discardBTW = jest.fn();
  const getSession = jest.fn();

  beforeEach(() => {
    delete globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
    globalWithFeatureFlags.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    dispatch.mockReset();
    discardBTW.mockReset();
    getSession.mockReset();
    getSession.mockReturnValue(null);
    mockTabsState.current = null;
    useAppDispatch.mockReturnValue(dispatch);
    useBTW.mockReturnValue({ discardBTW, getSession });
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

  function renderRightSidebar() {
    return renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { locale: "zh-CN", persistLocale: false },
        React.createElement(RightSidebar),
      ),
    );
  }

  it("does not render the debug tab by default", () => {
    const html = renderRightSidebar();

    expect(html).toContain("概览");
    expect(html).not.toContain("调试");
    expect(html).not.toContain("debug tab");
  });

  it("renders the debug panel outside the tab list when enabled by env", () => {
    globalWithFeatureFlags.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DEBUG_PANEL_ENABLED: "true",
    };

    const html = renderRightSidebar();

    expect(html).not.toContain("调试");
    expect(html).toContain("debug tab");
  });

  it("does not add the side-question tab when the active chat has no BTW session", () => {
    useAppState.mockReturnValue({
      ...createInitialState(),
      chatId: "chat_1",
      rightSidebarOpen: true,
      rightSidebarOpenTab: "btw",
    });

    const html = renderRightSidebar();

    expect(getSession).toHaveBeenCalledWith("chat_1");
    expect(html).not.toContain('data-tab-key="btw"');
    expect(html).not.toContain("btw tab");
    expect(html).toContain('data-active-key="overview"');
  });

  it("adds a closable side-question tab for the active chat session", () => {
    getSession.mockReturnValue({ parentChatId: "chat_1" });
    useAppState.mockReturnValue({
      ...createInitialState(),
      chatId: "chat_1",
      rightSidebarOpen: true,
      rightSidebarOpenTab: "btw",
    });

    const html = renderRightSidebar();

    expect(html).toContain('data-tab-key="btw"');
    expect(html).toContain('data-closable="true"');
    expect(html).toContain("顺便问");
    expect(html).toContain("btw tab");
  });

  it("discards the active BTW session and returns to overview when its tab closes", () => {
    getSession.mockReturnValue({ parentChatId: "chat_1" });
    useAppState.mockReturnValue({
      ...createInitialState(),
      chatId: "chat_1",
      rightSidebarOpen: true,
      rightSidebarOpenTab: "btw",
    });
    renderRightSidebar();

    mockTabsState.current.onEdit("btw", "remove");

    expect(discardBTW).toHaveBeenCalledWith("chat_1");
    expect(dispatch).toHaveBeenCalledWith({
      type: "OPEN_RIGHT_SIDEBAR",
      tab: "overview",
    });
  });

  it("only collapses the sidebar from the global close button", () => {
    getSession.mockReturnValue({ parentChatId: "chat_1" });
    useAppState.mockReturnValue({
      ...createInitialState(),
      chatId: "chat_1",
      rightSidebarOpen: true,
      rightSidebarOpenTab: "btw",
    });
    renderRightSidebar();

    mockTabsState.current.tabBarExtraContent.props.onClick();

    expect(discardBTW).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: "CLOSE_RIGHT_SIDEBAR" });
  });

  it("renders and activates a web preview tab", () => {
    useAppState.mockReturnValue({
      ...createInitialState(),
      rightSidebarOpen: true,
      rightSidebarOpenTab: "web",
      webPreviews: [
        { title: "百度", url: "https://www.baidu.com/" },
        { title: "Example", url: "https://example.com/" },
      ],
      activeWebPreviewUrl: "https://www.baidu.com/",
    });

    const html = renderRightSidebar();

    expect(html).toContain('data-active-key="web:https://www.baidu.com/"');
    expect(html).toContain('src="https://www.baidu.com/"');
    expect(html).toContain("百度");

    mockTabsState.current.onChange("web:https://example.com/");
    expect(dispatch).toHaveBeenCalledWith({
      type: "OPEN_RIGHT_SIDEBAR",
      tab: "web",
      activeWebPreviewUrl: "https://example.com/",
    });
  });

  it("closes a web preview tab and returns to overview after the last one", () => {
    useAppState.mockReturnValue({
      ...createInitialState(),
      rightSidebarOpen: true,
      rightSidebarOpenTab: "web",
      webPreviews: [
        { title: "百度", url: "https://www.baidu.com/" },
      ],
      activeWebPreviewUrl: "https://www.baidu.com/",
    });
    renderRightSidebar();

    mockTabsState.current.onEdit(
      "web:https://www.baidu.com/",
      "remove",
    );

    expect(dispatch).toHaveBeenCalledWith({
      type: "OPEN_RIGHT_SIDEBAR",
      tab: "overview",
      removeWebPreviewUrl: "https://www.baidu.com/",
    });
  });
});
