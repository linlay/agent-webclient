import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/state";
import { CopilotShell } from "@/app/layout/CopilotShell";

jest.mock("react-router-dom", () => ({
  useLocation: jest.fn(),
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

jest.mock("@/features/timeline/components/ConversationStage", () => ({
  ConversationStage: (props: { showEmptyState?: boolean }) =>
    React.createElement(
      "main",
      {
        className: "conversation-stage",
        "data-show-empty-state": String(props.showEmptyState),
      },
      "stage",
    ),
}));

jest.mock("@/app/layout/BottomDock", () => ({
  BottomDock: (props: { mode?: string }) =>
    React.createElement(
      "footer",
      { className: "bottom-dock", "data-mode": props.mode || "" },
      "dock",
    ),
}));

jest.mock("@/app/layout/LeftSidebar", () => ({
  LeftSidebar: () =>
    React.createElement("aside", { className: "left-sidebar" }, "left sidebar"),
}));

jest.mock("@/app/layout/sidebar/right/RightSidebar", () => ({
  RightSidebar: () =>
    React.createElement(
      "aside",
      { className: "right-sidebar" },
      "right sidebar",
    ),
}));

jest.mock("@/app/layout/TerminalDock", () => ({
  TerminalDock: () =>
    React.createElement("section", { className: "terminal-dock" }, "terminal"),
}));

jest.mock("@/app/layout/CommandStatusOverlay", () => ({
  CommandStatusOverlay: () => (
    React.createElement(
      "div",
      { className: "command-status-overlay" },
      "status overlay",
    )
  ),
}));

jest.mock("@/features/artifacts/components/AttachmentPreviewPanel", () => ({
  AttachmentPreviewPanel: () => (
    React.createElement(
      "div",
      { className: "attachment-preview-panel" },
      "attachment preview",
    )
  ),
}));

jest.mock("@/app/layout/sidebar/right/DebugTab", () => ({
  DebugTab: () =>
    React.createElement("div", { className: "debug-tab" }, "debug tab"),
}));

jest.mock("@/app/layout/sidebar/right/OverviewTab", () => ({
  OverviewTab: () =>
    React.createElement("div", { className: "overview-tab" }, "overview tab"),
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

jest.mock("@/features/workers/components/CommandOverlayHost", () => ({
  CommandOverlayHost: (props: { variant?: string }) =>
    React.createElement(
      "div",
      {
        className: "command-modal",
        "data-variant": props.variant || "default",
      },
      "command",
    ),
}));

jest.mock("@/app/modals/EventPopover", () => ({
  EventPopover: () =>
    React.createElement("div", { className: "event-popover" }, "event"),
}));

jest.mock("@/app/effects/FireworksCanvas", () => ({
  FireworksCanvas: () =>
    React.createElement("canvas", { className: "fireworks-canvas" }),
}));

jest.mock("@/shared/config/featureFlags", () => ({
  isDebugPanelEnabled: jest.fn(() => true),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params?.shortcut ? `${key} ${params.shortcut}` : key,
  }),
}));

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

const { isDebugPanelEnabled } = jest.requireMock(
  "@/shared/config/featureFlags",
) as {
  isDebugPanelEnabled: jest.Mock;
};

const {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} = jest.requireMock("react-router-dom") as {
  useLocation: jest.Mock;
  useNavigate: jest.Mock;
  useParams: jest.Mock;
  useSearchParams: jest.Mock;
};

const globalWithStorage = globalThis as typeof globalThis & {
  window?: {
    addEventListener: jest.Mock;
    dispatchEvent: jest.Mock;
    location: {
      pathname: string;
      search: string;
    };
    removeEventListener: jest.Mock;
  };
  CustomEvent?: typeof CustomEvent;
  localStorage?: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };
};

describe("CopilotShell", () => {
  const originalWindow = globalWithStorage.window;
  const originalCustomEvent = globalWithStorage.CustomEvent;
  const originalLocalStorage = globalWithStorage.localStorage;
  const navigate = jest.fn();

  beforeEach(() => {
    globalWithStorage.window = {
      addEventListener: jest.fn(),
      dispatchEvent: jest.fn(() => true),
      location: {
        pathname: "/copilot",
        search: "",
      },
      removeEventListener: jest.fn(),
    };
    globalWithStorage.CustomEvent = class TestCustomEvent<T = unknown> extends Event {
      detail: T;

      constructor(type: string, init?: CustomEventInit<T>) {
        super(type);
        this.detail = init?.detail as T;
      }
    } as typeof CustomEvent;
    globalWithStorage.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    useSearchParams.mockReturnValue([new URLSearchParams("")]);
    useParams.mockReturnValue({});
    useLocation.mockReturnValue({ pathname: "/copilot" });
    useNavigate.mockReturnValue(navigate);
    navigate.mockClear();
    useAppState.mockReturnValue(createInitialState());
    useAppDispatch.mockReturnValue(jest.fn());
    useAppRuntimes.mockClear();
    isDebugPanelEnabled.mockReturnValue(true);
  });

  afterAll(() => {
    if (originalWindow) {
      globalWithStorage.window = originalWindow;
    } else {
      delete globalWithStorage.window;
    }
    if (originalCustomEvent) {
      globalWithStorage.CustomEvent = originalCustomEvent;
    } else {
      delete globalWithStorage.CustomEvent;
    }
    if (originalLocalStorage) {
      globalWithStorage.localStorage = originalLocalStorage;
      return;
    }
    delete globalWithStorage.localStorage;
  });

  it("renders the compact Copilot layout with stage and dock", () => {
    const html = renderToStaticMarkup(React.createElement(CopilotShell));

    expect(html).toContain("layout-copilot");
    expect(html).toContain("copilot-topbar");
    expect(html).toContain("conversation-stage");
    expect(html).toContain("bottom-dock");
    expect(html).toContain('data-show-empty-state="false"');
    expect(html).toContain('data-mode="copilot"');
    expect(html).toContain("command-modal");
    expect(html).toContain('data-variant="copilot"');
    expect(useAppRuntimes).toHaveBeenCalledTimes(1);
  });

  it("renders a single-line top bar without voice or mute controls", () => {
    const html = renderToStaticMarkup(React.createElement(CopilotShell));

    expect(html).toContain("copilot-topbar-row");
    expect(html).toContain("copilot-title-block");
    expect(html).toContain("copilot-worker-switch-btn");
    expect(html).toContain("swap_horiz");
    expect(html).toContain("edit_square");
    expect(html).toContain("history");
    expect(html).toContain("bug_report");
    expect(html).toContain("settings");
    expect(html).not.toContain(">call<");
    expect(html).not.toContain(">call_end<");
    expect(html).not.toContain("volume_up");
    expect(html).not.toContain("volume_off");
  });

  it("does not render desktop-only shell chrome", () => {
    const html = renderToStaticMarkup(React.createElement(CopilotShell));

    expect(html).not.toContain("left-sidebar");
    expect(html).not.toContain("right-sidebar");
    expect(html).not.toContain("terminal-dock");
  });

  it("hides the compact debug drawer trigger when debug is disabled", () => {
    isDebugPanelEnabled.mockReturnValue(false);

    const html = renderToStaticMarkup(React.createElement(CopilotShell));

    expect(html).not.toContain("bug_report");
  });

  it("renders the compact side panel for reused right-sidebar content", () => {
    useAppState.mockReturnValue({
      ...createInitialState(),
      rightSidebarOpen: true,
      rightSidebarOpenTab: "overview",
    });

    const html = renderToStaticMarkup(React.createElement(CopilotShell));

    expect(html).toContain("copilot-side-panel");
    expect(html).toContain("overview-tab");
  });

  it("starts the first loaded agent conversation on the bare copilot route", () => {
    const dispatch = jest.fn();
    const dispatchEvent = globalWithStorage.window?.dispatchEvent as jest.Mock;
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "first-agent", name: "First Agent" },
        { key: "second-agent", name: "Second Agent" },
      ],
      workerSelectionKey: "agent:first-agent",
    });
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(CopilotShell));

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_WORKER_SELECTION_KEY",
      workerKey: "agent:first-agent",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_PENDING_NEW_CHAT_AGENT_KEY",
      agentKey: "first-agent",
    });
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent:start-new-conversation",
        detail: {
          agentKey: "first-agent",
          preserveWorkerContext: true,
          focusComposerOnComplete: true,
        },
      }),
    );
    expect(navigate).not.toHaveBeenCalled();

    useEffectSpy.mockRestore();
  });

  it("updates the copilot URL when the user selects another agent on the bare route", () => {
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "first-agent", name: "First Agent" },
        { key: "second-agent", name: "Second Agent" },
      ],
    });

    renderToStaticMarkup(React.createElement(CopilotShell));
    const selectWorkerHandler = (
      globalWithStorage.window?.addEventListener as jest.Mock
    ).mock.calls.find(([type]) => type === "agent:select-worker")?.[1];
    selectWorkerHandler(
      new CustomEvent("agent:select-worker", {
        detail: { workerKey: "agent:second-agent" },
      }),
    );

    expect(navigate).toHaveBeenCalledWith("/copilot/second-agent");

    useEffectSpy.mockRestore();
  });

  it("updates the copilot URL when the user selects another agent on an agent route", () => {
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useLocation.mockReturnValue({ pathname: "/copilot/first-agent" });
    useParams.mockReturnValue({ agentKey: "first-agent" });
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "first-agent", name: "First Agent" },
        { key: "second-agent", name: "Second Agent" },
      ],
    });

    renderToStaticMarkup(React.createElement(CopilotShell));
    const selectWorkerHandler = (
      globalWithStorage.window?.addEventListener as jest.Mock
    ).mock.calls.find(([type]) => type === "agent:select-worker")?.[1];
    selectWorkerHandler(
      new CustomEvent("agent:select-worker", {
        detail: { workerKey: "agent:second-agent" },
      }),
    );

    expect(navigate).toHaveBeenCalledWith("/copilot/second-agent");

    useEffectSpy.mockRestore();
  });

  it("clears the copilot agent URL when the user selects a team", () => {
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useLocation.mockReturnValue({ pathname: "/copilot/first-agent" });
    useParams.mockReturnValue({ agentKey: "first-agent" });
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "first-agent", name: "First Agent" },
        { key: "second-agent", name: "Second Agent" },
      ],
    });

    renderToStaticMarkup(React.createElement(CopilotShell));
    const selectWorkerHandler = (
      globalWithStorage.window?.addEventListener as jest.Mock
    ).mock.calls.find(([type]) => type === "agent:select-worker")?.[1];
    selectWorkerHandler(
      new CustomEvent("agent:select-worker", {
        detail: { workerKey: "team:default" },
      }),
    );

    expect(navigate).toHaveBeenCalledWith("/copilot");

    useEffectSpy.mockRestore();
  });

  it("starts the requested agent conversation from the copilot path", () => {
    const dispatch = jest.fn();
    const dispatchEvent = globalWithStorage.window?.dispatchEvent as jest.Mock;
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useParams.mockReturnValue({ agentKey: "demo-agent" });
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "first-agent", name: "First Agent" },
        { key: "demo-agent", name: "Demo Agent" },
      ],
    });
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(CopilotShell));

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

  it("falls back to the first loaded agent when the copilot path agent is missing", () => {
    const dispatch = jest.fn();
    const dispatchEvent = globalWithStorage.window?.dispatchEvent as jest.Mock;
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useParams.mockReturnValue({ agentKey: "missing-agent" });
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "first-agent", name: "First Agent" },
        { key: "demo-agent", name: "Demo Agent" },
      ],
    });
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(CopilotShell));

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_WORKER_SELECTION_KEY",
      workerKey: "agent:first-agent",
    });
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent:start-new-conversation",
        detail: {
          agentKey: "first-agent",
          preserveWorkerContext: true,
          focusComposerOnComplete: true,
        },
      }),
    );

    useEffectSpy.mockRestore();
  });

  it("starts the requested agent conversation from the copilot query", () => {
    const dispatch = jest.fn();
    const dispatchEvent = globalWithStorage.window?.dispatchEvent as jest.Mock;
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useSearchParams.mockReturnValue([new URLSearchParams("agentKey=demo-agent")]);
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "first-agent", name: "First Agent" },
        { key: "demo-agent", name: "Demo Agent" },
      ],
    });
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(CopilotShell));

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

  it("loads the requested chat from the copilot query", () => {
    const dispatch = jest.fn();
    const dispatchEvent = globalWithStorage.window?.dispatchEvent as jest.Mock;
    const useEffectSpy = jest
      .spyOn(React, "useEffect")
      .mockImplementation((effect: React.EffectCallback) => {
        effect();
      });
    useSearchParams.mockReturnValue([
      new URLSearchParams("agentKey=demo-agent&chatId=chat-123"),
    ]);
    useAppState.mockReturnValue({
      ...createInitialState(),
      agents: [
        { key: "first-agent", name: "First Agent" },
        { key: "demo-agent", name: "Demo Agent" },
      ],
    });
    useAppDispatch.mockReturnValue(dispatch);

    renderToStaticMarkup(React.createElement(CopilotShell));

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_WORKER_SELECTION_KEY",
      workerKey: "agent:demo-agent",
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
});
