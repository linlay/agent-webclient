import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/state";
import { AgentChatShell } from "@/app/layout/AgentChatShell";
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

jest.mock("@/features/settings/components/ArchiveModal", () => ({
  ArchiveModal: () =>
    React.createElement("div", { className: "archive-modal" }, "archive"),
}));

jest.mock("@/app/modals/CommandModal", () => ({
  CommandModal: () =>
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

  it("falls back to a non-CODER placeholder when route agent hydration fails", async () => {
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
      type: "SET_AGENTS",
      agents: [{ key: "demo-agent", name: "demo-agent", role: "--" }],
    });
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
    expect(html).toContain("right-sidebar");
    expect(html).not.toContain("left-sidebar");
    expect(useAppRuntimes).toHaveBeenCalledTimes(1);
  });

  it("dispatches a new blank conversation event after the route agent is ready", () => {
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

  it("loads a chat when chatId is present in the query string", () => {
    const dispatch = jest.fn();
    const dispatchEvent = globalWithDom.window?.dispatchEvent as jest.Mock;
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useSearchParams.mockReturnValue([new URLSearchParams("chatId=chat-123")]);
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "demo-agent", name: "Demo Agent", role: "Worker", mode: "CODER" },
      ],
    });
    useAppDispatch.mockReturnValue(dispatch);

    const html = renderToStaticMarkup(React.createElement(AgentChatShell));

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
    expect(html).toContain("agent-route-loading-page");
    expect(html).toContain("Loading agent");
    expect(html).not.toContain("conversation-stage");

    useEffectSpy.mockRestore();
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
      type: "SET_CONVERSATION_MODE",
      mode: "worker",
    });
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

  it("opens route history when history=1 is present without starting a blank conversation", () => {
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
      type: "SET_CONVERSATION_MODE",
      mode: "worker",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_WORKER_SELECTION_KEY",
      workerKey: "agent:demo-agent",
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
    expect(dispatchEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent:start-new-conversation",
      }),
    );
    expect(html).toContain("worker-history-modal");

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
      "zenmind:service-webview:action",
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
