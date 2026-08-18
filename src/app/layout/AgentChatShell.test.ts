import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/state";
import {
  AgentChatShell,
  consumeLiveSessionPromotion,
  createChatRouteKey,
  createNewChatRouteKey,
  createResolvedNewChatRoute,
  isAgentRouteAuthenticationError,
  parseNewChatTimestamp,
} from "@/app/layout/AgentChatShell";
import { ApiError } from "@/shared/data/api/client";
import { SERVICE_WEBVIEW_BRIDGE_ACTION_CHANNEL } from "@/shared/hooks/agentPage/useDesktopAction";
import type { Chat, WorkerRow } from "@/app/state/types";

jest.mock("react-router-dom", () => ({
  useNavigate: jest.fn(),
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
  ConversationStage: ({ showEmptyState }: { showEmptyState?: boolean }) =>
    React.createElement(
      "main",
      {
        className: "conversation-stage",
        "data-show-empty-state": String(showEmptyState ?? true),
      },
      "stage",
    ),
}));

jest.mock("@/app/layout/BottomDock", () => ({
  BottomDock: () =>
    React.createElement("footer", { className: "bottom-dock" }, "dock"),
}));

jest.mock("@/app/layout/LeftSidebar", () => ({
  LeftSidebar: () =>
    React.createElement("aside", { className: "left-sidebar" }, "left"),
}));

jest.mock("@/app/layout/sidebar/SidebarHistorySection", () => ({
  SidebarHistorySection: ({ open, historyRows }: any) =>
    open
      ? React.createElement(
          "section",
          {
            className: "worker-history-modal",
            "data-history-count": historyRows.length,
          },
          "history",
        )
      : null,
}));

jest.mock("@/shared/data", () => ({
  getAgent: jest.fn(() =>
    Promise.resolve({
      data: { key: "demo-agent", name: "Demo Agent", role: "Worker" },
    }),
  ),
  getChats: jest.fn(() => Promise.resolve({ data: [] })),
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

jest.mock("@/features/workers/components/CommandOverlayProvider", () => ({
  CommandOverlayProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  useCommandOverlayActions: () => ({
    openCommandOverlay: jest.fn(),
    patchCommandOverlay: jest.fn(),
    closeCommandOverlay: jest.fn(),
  }),
  useCommandOverlayOpen: () => false,
}));

jest.mock("@/features/search/components/GlobalSearchOverlayProvider", () => ({
  GlobalSearchOverlayProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  useGlobalSearchActions: () => ({
    openGlobalSearch: jest.fn(),
    closeGlobalSearch: jest.fn(),
  }),
  useGlobalSearchOpen: () => false,
}));

jest.mock("@/features/search/components/GlobalSearchOverlay", () => ({
  GlobalSearchOverlay: () => null,
}));

jest.mock("@/features/workers/components/CommandOverlayHost", () => ({
  CommandOverlayHost: () =>
    React.createElement("div", { className: "command-modal" }, "command"),
}));

jest.mock("@/app/modals/EventPopover", () => ({
  EventPopover: () =>
    React.createElement("div", { className: "event-popover" }, "event"),
}));

jest.mock("@/app/effects/FireworksCanvas", () => ({
  FireworksCanvas: () =>
    React.createElement("canvas", { className: "fireworks-canvas" }),
}));

const { useNavigate, useParams, useSearchParams } = jest.requireMock("react-router-dom") as {
  useNavigate: jest.Mock;
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

const { getAgent } = jest.requireMock(
  "@/shared/data",
) as {
  getAgent: jest.Mock;
};

const refreshWorkerData = jest.fn(() => Promise.resolve());

const flushPromises = async () => {
  await Promise.resolve();
};

const globalWithDom = globalThis as typeof globalThis & {
  window?: {
    addEventListener: jest.Mock;
    dispatchEvent: jest.Mock;
    removeEventListener: jest.Mock;
    electronAPI?: {
      onFromMain: jest.Mock;
    };
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
  it("classifies only an API 401 as an authentication failure", () => {
    expect(isAgentRouteAuthenticationError(new ApiError("unauthorized", { status: 401 }))).toBe(true);
    expect(isAgentRouteAuthenticationError(new ApiError("upstream", { status: 502 }))).toBe(false);
    expect(isAgentRouteAuthenticationError(new Error("network down"))).toBe(false);
  });
  const originalWindow = globalWithDom.window;
  const originalCustomEvent = globalWithDom.CustomEvent;
  const originalLocalStorage = globalWithDom.localStorage;
  const navigateMock = jest.fn();

  beforeEach(() => {
    globalWithDom.window = {
      addEventListener: jest.fn(),
      dispatchEvent: jest.fn(() => true),
      removeEventListener: jest.fn(),
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
    useNavigate.mockReturnValue(navigateMock);
    navigateMock.mockClear();
    useAppState.mockReturnValue(createInitialState());
    useAppDispatch.mockReturnValue(jest.fn());
    useAppRuntimes.mockClear();
    useAppRuntimes.mockReturnValue({ refreshWorkerData });
    refreshWorkerData.mockClear();
    getAgent.mockReset();
    getAgent.mockResolvedValue({
      data: {
        key: "demo-agent",
        name: "Demo Agent",
        role: "Worker",
        mode: "CODER",
      },
    });
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

  it("renders a loading page while the route agent is not ready", () => {
    const html = renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(html).toContain("agent-route-loading-page");
    expect(html).toContain("Loading agent");
    expect(html).not.toContain("conversation-stage");
    expect(useAppRuntimes).toHaveBeenCalledTimes(1);
    expect(useAppRuntimes).toHaveBeenCalledWith({
      initialWorkerRefreshEnabled: false,
    });
  });

  it("hydrates an unknown route agent before route activation", async () => {
    const dispatch = jest.fn();
    const dispatchEvent = globalWithDom.window?.dispatchEvent as jest.Mock;
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useAppState.mockReturnValue(createInitialState());
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(getAgent).toHaveBeenCalledWith("demo-agent");
    expect(dispatch).not.toHaveBeenCalledWith({
      type: "SET_WORKER_SELECTION_KEY",
      workerKey: "agent:demo-agent",
    });
    expect(dispatchEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent:start-new-conversation",
      }),
    );

    await flushPromises();

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_AGENTS",
      agents: [
        {
          key: "demo-agent",
          name: "Demo Agent",
          role: "Worker",
          mode: "CODER",
        },
      ],
    });

    useEffectSpy.mockRestore();
  });

  it("hydrates ACP CODER route agent summaries before route activation", async () => {
    const dispatch = jest.fn();
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    getAgent.mockResolvedValueOnce({
      data: {
        key: "demo-agent",
        name: "Demo Agent",
        role: "Worker",
        mode: "CODER",
        meta: { acpBridgeId: "codex" },
        modelOptions: {
          models: [{ key: "gpt-5.5", name: "GPT-5.5", modelId: "gpt-5.5" }],
          reasoningEfforts: [{ key: "HIGH", label: "HIGH" }],
          defaultModelKey: "gpt-5.5",
          defaultReasoningEffort: "HIGH",
        },
      },
    });
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        {
          key: "demo-agent",
          name: "Demo Agent",
          role: "Worker",
          mode: "CODER",
          meta: { acpBridgeId: "codex" },
        },
      ],
    });
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(getAgent).toHaveBeenCalledWith("demo-agent");
    expect(dispatch).not.toHaveBeenCalledWith({
      type: "SET_WORKER_SELECTION_KEY",
      workerKey: "agent:demo-agent",
    });

    await flushPromises();

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_AGENTS",
      agents: [
        expect.objectContaining({
          key: "demo-agent",
          mode: "CODER",
          meta: { acpBridgeId: "codex" },
          modelOptions: expect.objectContaining({
            defaultModelKey: "gpt-5.5",
            models: [expect.objectContaining({ key: "gpt-5.5" })],
          }),
        }),
      ],
    });

    useEffectSpy.mockRestore();
  });

  it("shows a route error when route agent hydration fails", async () => {
    const dispatch = jest.fn();
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    getAgent.mockRejectedValueOnce(new Error("network down"));
    useAppState.mockReturnValue(createInitialState());
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(AgentChatShell));
    await flushPromises();

    expect(dispatch).toHaveBeenCalledWith({
      type: "APPEND_DEBUG",
      line: "[loadAgent error] network down",
    });
    expect(dispatch).not.toHaveBeenCalledWith({
      type: "SET_AGENTS",
      agents: [
        expect.objectContaining({
          key: "demo-agent",
          mode: "CODER",
        }),
      ],
    });

    useEffectSpy.mockRestore();
  });

  it("renders the desktop chat layout without the left sidebar once the route agent is ready", () => {
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "demo-agent", name: "Demo Agent", role: "Worker", mode: "REACT" },
      ],
      workerSelectionKey: "agent:demo-agent",
    });

    const html = renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(html).toContain("layout-agent-route");
    expect(html).toContain("top-nav");
    expect(html).toContain("conversation-stage");
    expect(html).toContain('data-show-empty-state="true"');
    expect(html).toContain("bottom-dock");
    expect(html).not.toContain("right-sidebar");
    expect(html).not.toContain("terminal-dock");
    expect(html).not.toContain('<aside class="left-sidebar"');
    expect(useAppRuntimes).toHaveBeenCalledTimes(1);
  });

  it("does not start a blank conversation for a bare agent route", () => {
    const dispatch = jest.fn();
    const dispatchEvent = globalWithDom.window?.dispatchEvent as jest.Mock;
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "demo-agent", name: "Demo Agent", role: "Worker", mode: "CODER" },
      ],
      workerSelectionKey: "agent:demo-agent",
    });
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_WORKER_SELECTION_KEY",
      workerKey: "agent:demo-agent",
    });
    expect(dispatchEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent:start-new-conversation",
      }),
    );
    expect(dispatchEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent:load-chat",
      }),
    );

    useEffectSpy.mockRestore();
  });

  it("dispatches a new blank conversation event after an explicit new chat route is ready", () => {
    const dispatch = jest.fn();
    const dispatchEvent = globalWithDom.window?.dispatchEvent as jest.Mock;
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useSearchParams.mockReturnValue([new URLSearchParams("newChat=1783680000000")]);
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "demo-agent", name: "Demo Agent", role: "Worker", mode: "CODER" },
      ],
      workerSelectionKey: "agent:demo-agent",
    });
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_WORKER_SELECTION_KEY",
      workerKey: "agent:demo-agent",
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

  it("replaces an explicit new chat route only after a stable chat id is reported", () => {
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useSearchParams.mockReturnValue([
      new URLSearchParams("newChat=1783680000000&lang=en"),
    ]);
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "demo-agent", name: "Demo Agent", role: "Worker", mode: "CODER" },
      ],
      workerSelectionKey: "agent:demo-agent",
    });

    renderToStaticMarkup(React.createElement(AgentChatShell));

    const registration = (globalWithDom.window?.addEventListener as jest.Mock).mock.calls.find(
      ([type]) => type === "agent:new-chat-created",
    );
    expect(registration).toBeDefined();
    const listener = registration?.[1] as EventListener;
    const NewChatCreatedEvent = globalWithDom.CustomEvent as typeof CustomEvent;
    listener(
      new NewChatCreatedEvent("agent:new-chat-created", {
        detail: { chatId: "chat-123", agentKey: "confirmed-agent" },
      }),
    );

    expect(navigateMock).toHaveBeenCalledWith(
      "/agent/confirmed-agent?lang=en&chatId=chat-123",
      { replace: true },
    );

    useEffectSpy.mockRestore();
  });

  it("replaces an existing chat route when resend in new chat gets a stable chat id", () => {
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useSearchParams.mockReturnValue([
      new URLSearchParams("chatId=chat-old&lang=en"),
    ]);
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "demo-agent", name: "Demo Agent", role: "Worker", mode: "CODER" },
      ],
      workerSelectionKey: "agent:demo-agent",
    });

    renderToStaticMarkup(React.createElement(AgentChatShell));

    const registration = (globalWithDom.window?.addEventListener as jest.Mock).mock.calls.find(
      ([type]) => type === "agent:new-chat-created",
    );
    expect(registration).toBeDefined();
    const listener = registration?.[1] as EventListener;
    const NewChatCreatedEvent = globalWithDom.CustomEvent as typeof CustomEvent;
    listener(
      new NewChatCreatedEvent("agent:new-chat-created", {
        detail: { chatId: "chat-new", agentKey: "confirmed-agent" },
      }),
    );

    expect(navigateMock).toHaveBeenCalledWith(
      "/agent/confirmed-agent?lang=en&chatId=chat-new",
      { replace: true },
    );

    useEffectSpy.mockRestore();
  });

  it("builds no resolved route without a stable chat id", () => {
    expect(
      createResolvedNewChatRoute(
        "demo-agent",
        new URLSearchParams("newChat=1783680000000&lang=en"),
        "",
      ),
    ).toBe("");
  });

  it("replaces newChat while preserving host query parameters", () => {
    expect(
      createResolvedNewChatRoute(
        "demo-agent",
        new URLSearchParams(
          "newChat=1783680000000&lang=en&hostTheme=dark",
        ),
        "chat-123",
      ),
    ).toBe("/agent/demo-agent?lang=en&chatId=chat-123");
  });

  it("consumes a live-session promotion exactly once for its promoted chat route", () => {
    const promotions = new Set([
      createChatRouteKey("demo-agent", "chat-123"),
    ]);

    expect(
      consumeLiveSessionPromotion(promotions, "demo-agent", "chat-123"),
    ).toBe(true);
    expect(
      consumeLiveSessionPromotion(promotions, "demo-agent", "chat-123"),
    ).toBe(false);
    expect(
      consumeLiveSessionPromotion(promotions, "demo-agent", "chat-456"),
    ).toBe(false);
  });

  it("uses each timestamp as the retrigger key for explicit new chat routes", () => {
    expect(createNewChatRouteKey("demo-agent", "1783680000000")).toBe(
      "demo-agent\u00001783680000000",
    );
    expect(createNewChatRouteKey("demo-agent", "1783680000001")).not.toBe(
      createNewChatRouteKey("demo-agent", "1783680000000"),
    );
  });

  it("only accepts positive 13-digit Unix millisecond timestamps for new chat routes", () => {
    expect(parseNewChatTimestamp("1783680000000")).toBe("1783680000000");
    expect(parseNewChatTimestamp("1")).toBe("");
    expect(parseNewChatTimestamp("01783680000000")).toBe("");
    expect(parseNewChatTimestamp("17836800000000")).toBe("");
    expect(parseNewChatTimestamp("not-a-timestamp")).toBe("");
  });

  it("does not treat the legacy newChat URL as a new conversation request", () => {
    const dispatch = jest.fn();
    const dispatchEvent = globalWithDom.window?.dispatchEvent as jest.Mock;
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useSearchParams.mockReturnValue([
      new URLSearchParams("newChat=1&newChatRequest=123"),
    ]);
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "demo-agent", name: "Demo Agent", role: "Worker", mode: "CODER" },
      ],
      workerSelectionKey: "agent:demo-agent",
    });
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(dispatchEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent:start-new-conversation",
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
    useSearchParams.mockReturnValue([
      new URLSearchParams("chatId=chat-123&newChat=1783680000000"),
    ]);
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "demo-agent", name: "Demo Agent", role: "Worker", mode: "CODER" },
      ],
      workerSelectionKey: "agent:demo-agent",
    });
    useAppDispatch.mockReturnValue(dispatch);

    const html = renderToStaticMarkup(React.createElement(AgentChatShell));

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
    expect(html).toContain("agent-route-loading-page");
    expect(html).toContain("agent-route-loading-overlay");
    expect(html).toContain("Loading conversation");
    expect(html).toContain("conversation-stage");
    expect(html).toContain('data-show-empty-state="false"');

    useEffectSpy.mockRestore();
  });

  it("does not cover a visible route conversation while chat id binding catches up", () => {
    useSearchParams.mockReturnValue([new URLSearchParams("chatId=chat-123")]);
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "demo-agent", name: "Demo Agent", role: "Worker", mode: "CODER" },
      ],
      workerSelectionKey: "agent:demo-agent",
      timelineOrder: ["visible-node"],
    });

    const html = renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(html).toContain("conversation-stage");
    expect(html).not.toContain("agent-route-loading-page");
  });

  it("does not cover visible timeline content when route chat id and state chat id diverge", () => {
    useSearchParams.mockReturnValue([new URLSearchParams("chatId=chat-123")]);
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "demo-agent", name: "Demo Agent", role: "Worker", mode: "CODER" },
      ],
      chatId: "chat-from-live-stream",
      workerSelectionKey: "agent:demo-agent",
      timelineOrder: ["visible-node"],
    });

    const html = renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(html).toContain("conversation-stage");
    expect(html).not.toContain("agent-route-loading-page");
  });

  it("waits for agent hydration before activating a direct chat route", async () => {
    const dispatch = jest.fn();
    const dispatchEvent = globalWithDom.window?.dispatchEvent as jest.Mock;
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useSearchParams.mockReturnValue([new URLSearchParams("chatId=chat-123")]);
    useAppState.mockReturnValue(createInitialState());
    useAppDispatch.mockReturnValue(dispatch);

    const html = renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(getAgent).toHaveBeenCalledWith("demo-agent");
    expect(dispatch).not.toHaveBeenCalledWith({
      type: "SET_WORKER_SELECTION_KEY",
      workerKey: "agent:demo-agent",
    });
    expect(dispatchEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent:load-chat",
      }),
    );
    expect(html).toContain("Loading agent");
    expect(html).not.toContain("Loading conversation");

    await flushPromises();

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_AGENTS",
      agents: [
        {
          key: "demo-agent",
          name: "Demo Agent",
          role: "Worker",
          mode: "CODER",
        },
      ],
    });

    useEffectSpy.mockRestore();
  });

  it("renders the chat layout after the route chat is loaded", () => {
    useSearchParams.mockReturnValue([new URLSearchParams("chatId=chat-123")]);
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "demo-agent", name: "Demo Agent", role: "Worker", mode: "CODER" },
      ],
      chatId: "chat-123",
      workerSelectionKey: "agent:demo-agent",
    });

    const html = renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(html).toContain("layout-agent-route");
    expect(html).toContain("conversation-stage");
    expect(html).toContain('data-show-empty-state="false"');
    expect(html).not.toContain("agent-route-loading-page");
  });

  it("does not parse the removed history=1 route compatibility flag", () => {
    const dispatch = jest.fn();
    const dispatchEvent = globalWithDom.window?.dispatchEvent as jest.Mock;
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    const state = createInitialState();
    const workerRow: WorkerRow = {
      key: "agent:demo-agent",
      type: "agent",
      sourceId: "demo-agent",
      displayName: "Demo Agent",
      role: "Worker",
      teamAgentLabels: [],
      latestChatId: "chat-1",
      latestRunId: "run-1",
      latestUpdatedAt: 1000,
      latestChatName: "Chat 1",
      latestRunContent: "Preview",
      hasHistory: true,
      latestRunSortValue: 1000,
      searchText: "demo agent",
    };
    const chat: Chat = {
      chatId: "chat-1",
      chatName: "Chat 1",
      agentKey: "demo-agent",
      firstAgentKey: "demo-agent",
      updatedAt: 1000,
      lastRunId: "run-1",
      lastRunContent: "Preview",
    };
    useSearchParams.mockReturnValue([new URLSearchParams("history=1")]);
    useAppState.mockReturnValue({
      ...state,
      agents: [{ key: "demo-agent", name: "Demo Agent", mode: "REACT" }],
      chats: [chat],
      workerSelectionKey: "agent:demo-agent",
      workerRows: [workerRow],
      workerIndexByKey: new Map([[workerRow.key, workerRow]]),
    });
    useAppDispatch.mockReturnValue(dispatch);

    const html = renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_WORKER_SELECTION_KEY",
      workerKey: "agent:demo-agent",
    });
    expect(dispatchEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "agent:open-worker-history" }),
    );
    expect(dispatchEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent:start-new-conversation",
      }),
    );
    expect(html).not.toContain("worker-history-modal");

    useEffectSpy.mockRestore();
  });

  it("opens chat history from desktop action messages", () => {
    const dispatch = jest.fn();
    const dispatchEvent = globalWithDom.window?.dispatchEvent as jest.Mock;
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    const state = createInitialState();
    const workerRow: WorkerRow = {
      key: "agent:demo-agent",
      type: "agent",
      sourceId: "demo-agent",
      displayName: "Demo Agent",
      role: "Worker",
      teamAgentLabels: [],
      latestChatId: "chat-1",
      latestRunId: "run-1",
      latestUpdatedAt: 1000,
      latestChatName: "Chat 1",
      latestRunContent: "Preview",
      hasHistory: true,
      latestRunSortValue: 1000,
      searchText: "demo agent",
    };
    const chat: Chat = {
      chatId: "chat-1",
      chatName: "Chat 1",
      agentKey: "demo-agent",
      firstAgentKey: "demo-agent",
      updatedAt: 1000,
      lastRunId: "run-1",
      lastRunContent: "Preview",
    };
    let desktopActionListener:
      | ((event: unknown, payload: unknown) => void)
      | null = null;
    globalWithDom.window!.electronAPI = {
      onFromMain: jest.fn((_channel, listener) => {
        desktopActionListener = listener;
      }),
    };
    useAppState.mockReturnValue({
      ...state,
      agents: [{ key: "demo-agent", name: "Demo Agent", mode: "REACT" }],
      chats: [chat],
      workerSelectionKey: "agent:demo-agent",
      workerRows: [workerRow],
      workerIndexByKey: new Map([[workerRow.key, workerRow]]),
    });
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(globalWithDom.window!.electronAPI.onFromMain).toHaveBeenCalledWith(
      SERVICE_WEBVIEW_BRIDGE_ACTION_CHANNEL,
      expect.any(Function),
    );
    expect(desktopActionListener).toEqual(expect.any(Function));

    desktopActionListener?.(null, {
      action: "openChatHistory",
      data: { agentKey: "demo-agent" },
    });

    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent:open-worker-history",
        detail: {
          workerKey: "agent:demo-agent",
          agentKey: "demo-agent",
        },
      }),
    );

    useEffectSpy.mockRestore();
  });

  it("syncs the agent route when selecting a different agent", () => {
    const dispatch = jest.fn();
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useSearchParams.mockReturnValue([
      new URLSearchParams("chatId=chat-123&history=1&lang=en"),
    ]);
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "demo-agent", name: "Demo Agent", role: "Worker", mode: "REACT" },
        { key: "next-agent", name: "Next Agent", role: "Research", mode: "REACT" },
      ],
      workerSelectionKey: "agent:demo-agent",
    });
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(AgentChatShell));

    const selectWorkerListener = globalWithDom.window?.addEventListener.mock.calls.find(
      ([type]) => type === "agent:select-worker",
    )?.[1] as ((event: Event) => void) | undefined;
    expect(selectWorkerListener).toEqual(expect.any(Function));

    selectWorkerListener?.(
      new CustomEvent("agent:select-worker", {
        detail: {
          workerKey: "agent:next-agent",
        },
      }),
    );

    expect(navigateMock).toHaveBeenCalledWith("/agent/next-agent?lang=en");

    useEffectSpy.mockRestore();
  });

  it("leaves route theme query parameters to the base shell", () => {
    const dispatch = jest.fn();
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useSearchParams.mockReturnValue([new URLSearchParams("theme=dark")]);
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "demo-agent", name: "Demo Agent", role: "Worker", mode: "REACT" },
      ],
    });
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(dispatch).not.toHaveBeenCalledWith({
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
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "demo-agent", name: "Demo Agent", role: "Worker", mode: "REACT" },
      ],
    });
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(AgentChatShell));

    expect(dispatch).not.toHaveBeenCalledWith({
      type: "SET_THEME_MODE",
      themeMode: "dark",
    });

    useEffectSpy.mockRestore();
  });
});
