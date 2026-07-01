import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CommandModal } from "@/features/workers/components/CommandModal";
import { createCommandOverlayState } from "@/features/workers/lib/commandOverlay";
import { createInitialState } from "@/app/state/state";
import type { AppState, WorkerRow } from "@/app/state/types";

const mockSwitchProps: any[] = [];

jest.mock("antd", () => {
  const actual = jest.requireActual("antd");
  const React = require("react");
  return {
    ...actual,
    Modal: ({ children, className, open }: any) =>
      open ? React.createElement("section", { className }, children) : null,
  };
});

jest.mock("@/app/state/AppContext", () => ({
  useAppState: jest.fn(),
  useAppDispatch: jest.fn(() => jest.fn()),
}));

jest.mock("antd/es/app/useApp", () => ({
  __esModule: true,
  default: () => ({
    message: {
      error: jest.fn(),
      success: jest.fn(),
    },
    modal: {
      confirm: jest.fn(),
    },
  }),
}));

jest.mock("@/features/workers/components/SwitchModal", () => {
  const React = require("react");
  return {
    SWITCH_SCOPES: [
      { key: "all", labelKey: "switch.scope.all" },
      { key: "agent", labelKey: "switch.workerType.agent" },
      { key: "team", labelKey: "switch.workerType.team" },
    ],
    SwitchModal: (props: any) => {
      mockSwitchProps.push(props);
      return React.createElement("div", {
        className: "switch-modal",
        "data-variant": props.variant,
      });
    },
  };
});

jest.mock("@/features/workers/components/AgentConsole", () => {
  const React = require("react");
  return {
    AgentConsole: () => React.createElement("div", null, "agent console"),
  };
});

jest.mock("@/features/settings/components/SettingsOverlayProvider", () => ({
  useSettingsOverlayActions: () => ({
    openOverlay: jest.fn(),
    closeOverlay: jest.fn(),
  }),
  useSettingsOverlayState: () => ({
    activeOverlay: null,
    isAnyOverlayOpen: false,
  }),
  SettingsOverlayProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

jest.mock("@/features/tools/components/buildin/confirm-dialog/state", () => ({
  isEditableKeyboardTarget: jest.fn(() => false),
}));

jest.mock("@/shared/i18n", () => ({
  t: (key: string) => key,
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock("@/shared/icons/agent", () => {
  const React = require("react");
  return {
    AgentIcon: ({ type }: any) =>
      React.createElement("span", {
        className: "agent-icon-mock",
        "data-agent-type": type,
      }),
  };
});

jest.mock("@/shared/ui/MaterialIcon", () => {
  const React = require("react");
  return {
    MaterialIcon: ({ name }: any) =>
      React.createElement("span", {
        className: "material-icon-mock",
        "data-icon-name": name,
      }),
  };
});

const { useAppState } = jest.requireMock("@/app/state/AppContext") as {
  useAppState: jest.Mock;
};

const globalWithStorage = globalThis as typeof globalThis & {
  localStorage?: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };
};

function createWorkerRow(overrides: Partial<WorkerRow> = {}): WorkerRow {
  return {
    key: "agent:agent-alpha",
    type: "agent",
    sourceId: "agent-alpha",
    displayName: "Alpha",
    role: "研究员",
    teamAgentLabels: [],
    latestChatId: "",
    latestRunId: "",
    latestUpdatedAt: 0,
    latestChatName: "",
    latestRunContent: "",
    hasHistory: false,
    latestRunSortValue: -1,
    searchText: "alpha",
    ...overrides,
  };
}

function createSwitchState(): AppState {
  const state = createInitialState();
  const worker = createWorkerRow();
  return {
    ...state,
    agents: [
      {
        key: "agent-alpha",
        name: "Alpha",
        role: "研究员",
        icon: { color: "#2563eb", name: "pulse" },
      },
    ],
    workerRows: [worker],
    workerIndexByKey: new Map([[worker.key, worker]]),
    workerSelectionKey: worker.key,
  };
}

function renderCommandModal(props: Partial<React.ComponentProps<typeof CommandModal>> = {}) {
  return renderToStaticMarkup(
    React.createElement(CommandModal, {
      modal: createCommandOverlayState({ type: "switch" }),
      onPatch: jest.fn(),
      onClose: jest.fn(),
      ...props,
    }),
  );
}

describe("CommandModal", () => {
  const originalLocalStorage = globalWithStorage.localStorage;

  beforeEach(() => {
    globalWithStorage.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    mockSwitchProps.length = 0;
    useAppState.mockReturnValue(createSwitchState());
  });

  afterAll(() => {
    if (originalLocalStorage) {
      globalWithStorage.localStorage = originalLocalStorage;
      return;
    }
    delete globalWithStorage.localStorage;
  });

  it("passes Copilot variant and worker icons into SwitchModal", () => {
    const html = renderCommandModal({ variant: "copilot" });

    expect(html).toContain('data-variant="copilot"');
    expect(mockSwitchProps).toHaveLength(1);
    expect(mockSwitchProps[0].variant).toBe("copilot");
    expect(mockSwitchProps[0].workerIconsByKey.get("agent:agent-alpha")).toEqual({
      color: "#2563eb",
      name: "pulse",
    });
  });

  it("keeps SwitchModal default variant for desktop CommandModal", () => {
    renderCommandModal();

    expect(mockSwitchProps).toHaveLength(1);
    expect(mockSwitchProps[0].variant).toBe("default");
  });

  it("renders the global command palette when type is global", () => {
    useAppState.mockReturnValue({
      ...createSwitchState(),
      workerRows: [
        createWorkerRow(),
        createWorkerRow({
          key: "team:team-beta",
          type: "team",
          sourceId: "team-beta",
          displayName: "Team Beta",
          searchText: "team beta",
        }),
      ],
    });

    const html = renderCommandModal({
      modal: createCommandOverlayState({ type: "global", searchText: "" }),
    });

    expect(html).toContain("global-command-panel");
    expect(html).toContain("global-command-input");
    expect(html).toContain("commandModal.global.placeholder");
    expect(html).toContain("global-command-list");
  });

  it("passes Copilot variant to global command palette", () => {
    useAppState.mockReturnValue({
      ...createSwitchState(),
      workerRows: [createWorkerRow()],
    });

    const html = renderCommandModal({
      modal: createCommandOverlayState({ type: "global" }),
      variant: "copilot",
    });

    expect(html).toContain("global-command-panel");
    expect(html).toContain("global-command-input");
  });

  it("renders global empty state when no rows match", () => {
    useAppState.mockReturnValue({
      ...createSwitchState(),
      workerRows: [],
    });
    // No current worker -> no action rows for newConversation
    // No worker rows
    // No history

    const html = renderCommandModal({
      modal: createCommandOverlayState({ type: "global", searchText: "zzz_nonexistent" }),
    });

    expect(html).toContain("global-command-panel");
    expect(html).toContain("commandModal.global.empty");
  });

  it("renders global command panel with grouped awaiting and unread rows", () => {
    const worker = createWorkerRow();
    useAppState.mockReturnValue({
      ...createSwitchState(),
      agents: [
        {
          key: "agent-alpha",
          name: "Alpha Agent",
          role: "研究员",
          chats: [
            {
              chatId: "chat-awaiting",
              chatName: "Needs Approval",
              agentKey: "agent-alpha",
              updatedAt: 200,
              lastRunId: "run-awaiting",
              lastRunContent: "Please approve",
              hasPendingAwaiting: true,
              awaiting: { mode: "approval" },
              read: { isRead: false },
            },
            {
              chatId: "chat-unread",
              chatName: "Unread Thread",
              agentKey: "agent-alpha",
              updatedAt: 100,
              lastRunId: "run-unread",
              lastRunContent: "Unread preview",
              read: { isRead: false },
            },
          ],
        },
      ],
      workerRows: [worker],
      workerIndexByKey: new Map([[worker.key, worker]]),
      workerSelectionKey: worker.key,
    });

    const html = renderCommandModal({
      modal: createCommandOverlayState({ type: "global" }),
    });

    expect(html).toContain("commandModal.global.section.awaiting");
    expect(html).toContain("commandModal.global.section.unread");
    expect(html).toContain("commandModal.global.section.actions");
    expect(html).toContain("commandModal.global.section.workers");
    expect(html).toContain("global-command-section-awaiting");
    expect(html).toContain("global-command-section-unread");
    expect(html).toContain("Needs Approval");
    expect(html).toContain("Unread Thread");
    expect(html).toContain("Alpha Agent");
    expect(html).toContain("leftSidebar.awaitingStatus.approval");
  });

  it("renders global command panel with worker rows", () => {
    useAppState.mockReturnValue({
      ...createSwitchState(),
      workerRows: [
        createWorkerRow(),
        createWorkerRow({
          key: "agent:agent-beta",
          type: "agent",
          sourceId: "agent-beta",
          displayName: "Beta",
          searchText: "beta",
        }),
      ],
    });

    const html = renderCommandModal({
      modal: createCommandOverlayState({ type: "global" }),
    });

    expect(html).toContain("global-command-worker");
    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");
  });
});
