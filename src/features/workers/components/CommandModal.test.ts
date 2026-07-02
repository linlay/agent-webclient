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
});
