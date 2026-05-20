import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/state";
import { AgentChatShell } from "@/app/layout/AgentChatShell";

jest.mock("react-router-dom", () => ({
  useParams: jest.fn(),
  useSearchParams: jest.fn(),
}));

jest.mock("@/app/state/AppContext", () => ({
  useAppState: jest.fn(),
  useAppDispatch: jest.fn(),
}));

jest.mock("@/app/layout/hooks/useAppRuntimes", () => ({
  useAppRuntimes: jest.fn(),
}));

jest.mock("@/app/layout/TopNav", () => ({
  TopNav: () => React.createElement("nav", { className: "top-nav" }, "top"),
}));

jest.mock("@/features/timeline/components/ConversationStage", () => ({
  ConversationStage: () =>
    React.createElement("main", { className: "conversation-stage" }, "stage"),
}));

jest.mock("@/app/layout/BottomDock", () => ({
  BottomDock: () =>
    React.createElement("footer", { className: "bottom-dock" }, "dock"),
}));

jest.mock("@/app/layout/LeftSidebar", () => ({
  LeftSidebar: () =>
    React.createElement("aside", { className: "left-sidebar" }, "left"),
}));

jest.mock("@/app/layout/sidebar/right/RightSidebar", () => ({
  RightSidebar: () =>
    React.createElement("aside", { className: "right-sidebar" }, "right"),
}));

jest.mock("@/app/layout/TerminalDock", () => ({
  TerminalDock: () =>
    React.createElement("section", { className: "terminal-dock" }, "terminal"),
}));

jest.mock("@/app/layout/CommandStatusOverlay", () => ({
  CommandStatusOverlay: () =>
    React.createElement("div", { className: "command-status-overlay" }, "status"),
}));

jest.mock("@/features/settings/components/SettingsModal", () => ({
  SettingsModal: () =>
    React.createElement("div", { className: "settings-modal" }, "settings"),
}));

jest.mock("@/features/settings/components/MemoryInfoModal", () => ({
  MemoryInfoModal: () =>
    React.createElement("div", { className: "memory-info-modal" }, "memory"),
}));

jest.mock("@/features/settings/components/ArchiveModal", () => ({
  ArchiveModal: () =>
    React.createElement("div", { className: "archive-modal" }, "archive"),
}));

jest.mock("@/app/modals/CommandModal", () => ({
  CommandModal: () =>
    React.createElement("div", { className: "command-modal" }, "command"),
}));

jest.mock("@/app/modals/ActionModal", () => ({
  ActionModal: () =>
    React.createElement("div", { className: "action-modal" }, "action"),
}));

jest.mock("@/app/modals/EventPopover", () => ({
  EventPopover: () =>
    React.createElement("div", { className: "event-popover" }, "event"),
}));

jest.mock("@/app/effects/FireworksCanvas", () => ({
  FireworksCanvas: () =>
    React.createElement("canvas", { className: "fireworks-canvas" }),
}));

const { useParams, useSearchParams } = jest.requireMock("react-router-dom") as {
  useParams: jest.Mock;
  useSearchParams: jest.Mock;
};

const { useAppState, useAppDispatch } = jest.requireMock(
  "@/app/state/AppContext",
) as {
  useAppState: jest.Mock;
  useAppDispatch: jest.Mock;
};

const { useAppRuntimes } = jest.requireMock(
  "@/app/layout/hooks/useAppRuntimes",
) as {
  useAppRuntimes: jest.Mock;
};

const globalWithDom = globalThis as typeof globalThis & {
  window?: {
    dispatchEvent: jest.Mock;
    location: {
      pathname: string;
      search: string;
    };
  };
  localStorage?: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };
  CustomEvent?: typeof CustomEvent;
};

describe("AgentChatShell", () => {
  const originalWindow = globalWithDom.window;
  const originalCustomEvent = globalWithDom.CustomEvent;
  const originalLocalStorage = globalWithDom.localStorage;

  beforeEach(() => {
    globalWithDom.window = {
      dispatchEvent: jest.fn(() => true),
      location: {
        pathname: "/agent/demo-agent",
        search: "",
      },
    };
    globalWithDom.CustomEvent = class TestCustomEvent<T = unknown> extends Event {
      detail: T;

      constructor(type: string, init?: CustomEventInit<T>) {
        super(type);
        this.detail = init?.detail as T;
      }
    } as typeof CustomEvent;
    globalWithDom.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    useParams.mockReturnValue({ agentKey: "demo-agent" });
    useSearchParams.mockReturnValue([new URLSearchParams("")]);
    useAppState.mockReturnValue(createInitialState());
    useAppDispatch.mockReturnValue(jest.fn());
    useAppRuntimes.mockClear();
  });

  afterAll(() => {
    if (originalWindow) {
      globalWithDom.window = originalWindow;
    } else {
      delete globalWithDom.window;
    }
    if (originalCustomEvent) {
      globalWithDom.CustomEvent = originalCustomEvent;
    } else {
      delete globalWithDom.CustomEvent;
    }
    if (originalLocalStorage) {
      globalWithDom.localStorage = originalLocalStorage;
    } else {
      delete globalWithDom.localStorage;
    }
  });

  it("renders the desktop chat layout without the left sidebar", () => {
    const html = renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(html).toContain("layout-agent-route");
    expect(html).toContain("top-nav");
    expect(html).toContain("conversation-stage");
    expect(html).toContain("bottom-dock");
    expect(html).toContain("right-sidebar");
    expect(html).not.toContain("left-sidebar");
    expect(useAppRuntimes).toHaveBeenCalledTimes(1);
  });

  it("dispatches a new blank conversation event for the route agent", () => {
    const dispatch = jest.fn();
    const dispatchEvent = globalWithDom.window?.dispatchEvent as jest.Mock;
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_AGENTS",
      agents: [{ key: "demo-agent", name: "demo-agent", role: "--" }],
    });
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent:start-new-conversation",
        detail: {
          agentKey: "demo-agent",
          preserveWorkerContext: true,
          focusComposerOnComplete: true,
        },
      }),
    );

    useEffectSpy.mockRestore();
  });

  it("loads a chat when chatId is present in the query string", () => {
    const dispatch = jest.fn();
    const dispatchEvent = globalWithDom.window?.dispatchEvent as jest.Mock;
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useSearchParams.mockReturnValue([new URLSearchParams("chatId=chat-123")]);
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_CONVERSATION_MODE",
      mode: "worker",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_WORKER_SELECTION_KEY",
      workerKey: "agent:demo-agent",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_PENDING_NEW_CHAT_AGENT_KEY",
      agentKey: "demo-agent",
    });
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent:load-chat",
        detail: {
          chatId: "chat-123",
          focusComposerOnComplete: true,
        },
      }),
    );
    expect(dispatchEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent:start-new-conversation",
      }),
    );

    useEffectSpy.mockRestore();
  });

  it("applies route theme query parameters", () => {
    const dispatch = jest.fn();
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useSearchParams.mockReturnValue([new URLSearchParams("theme=dark")]);
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_THEME_MODE",
      themeMode: "dark",
    });

    useEffectSpy.mockRestore();
  });

  it("ignores themeMode as a route-level theme alias", () => {
    const dispatch = jest.fn();
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useSearchParams.mockReturnValue([new URLSearchParams("themeMode=dark")]);
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(dispatch).not.toHaveBeenCalledWith({
      type: "SET_THEME_MODE",
      themeMode: "dark",
    });

    useEffectSpy.mockRestore();
  });
});
