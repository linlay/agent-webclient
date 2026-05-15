import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CommandModal } from "@/app/modals/CommandModal";
import { createInitialState } from "@/app/state/state";
import type { AppState, WorkerRow } from "@/app/state/types";

const mockSwitchProps: any[] = [];

jest.mock("@/app/state/AppContext", () => ({
  useAppState: jest.fn(),
  useAppDispatch: jest.fn(() => jest.fn()),
}));

jest.mock("@/app/modals/SwitchModal", () => {
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

jest.mock("@/shared/i18n", () => ({
  t: (key: string) => key,
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

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
    commandModal: {
      ...state.commandModal,
      open: true,
      type: "switch",
    },
  };
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
    const html = renderToStaticMarkup(
      React.createElement(CommandModal, { variant: "copilot" }),
    );

    expect(html).toContain('data-variant="copilot"');
    expect(mockSwitchProps).toHaveLength(1);
    expect(mockSwitchProps[0].variant).toBe("copilot");
    expect(mockSwitchProps[0].workerIconsByKey.get("agent:agent-alpha")).toEqual({
      color: "#2563eb",
      name: "pulse",
    });
  });

  it("keeps SwitchModal default variant for desktop CommandModal", () => {
    renderToStaticMarkup(React.createElement(CommandModal));

    expect(mockSwitchProps).toHaveLength(1);
    expect(mockSwitchProps[0].variant).toBe("default");
  });
});
