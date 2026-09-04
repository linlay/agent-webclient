import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AutomationsPage } from "@/app/pages/automations";
import { CommandDrawer } from "@/features/workers/components/CommandDrawer";
import { CommandModal } from "@/features/workers/components/CommandModal";
import { createCommandOverlayState } from "@/features/workers/lib/commandOverlay";

const mockAutomationConsoleProps: Array<Record<string, any>> = [];
const mockDispatch = jest.fn();
const mockCurrentWorker = {
  type: "agent",
  sourceId: "agent-a",
  displayName: "Agent A",
};
const mockAgents = [{ key: "agent-a", name: "Agent A" }];
const mockTeams = [{ teamId: "team-a", name: "Team A" }];
const mockState = {
  agents: mockAgents,
  teams: mockTeams,
  workerRows: [],
  chatId: "",
};

jest.mock("antd", () => {
  const React = require("react");
  return {
    Drawer: ({ open, children, title }: any) =>
      open
        ? React.createElement(
            "section",
            { "data-overlay": "drawer" },
            title,
            children,
          )
        : null,
    Modal: ({ open, children, title }: any) =>
      open
        ? React.createElement(
            "section",
            { "data-overlay": "modal" },
            title,
            children,
          )
        : null,
  };
});

jest.mock("@/app/state/AppContext", () => ({
  useAppDispatch: () => mockDispatch,
  useAppState: () => mockState,
  useOptionalAppContext: () => null,
}));

jest.mock("@/features/automations/components/AutomationHistoryConsole", () => ({
  AutomationHistoryConsole: (props: Record<string, any>) => {
    mockAutomationConsoleProps.push(props);
    return React.createElement("div", {
      "data-testid": "automation-history-console",
    });
  },
}));

jest.mock("@/features/workers/lib/currentWorker", () => ({
  buildWorkerSwitchRows: () => [],
  resolveCurrentWorkerSummary: () => mockCurrentWorker,
}));

jest.mock("@/features/chats/components/HistoryModal", () => ({
  HistoryModal: () => null,
}));

jest.mock("@/features/workers/components/SwitchModal", () => ({
  SWITCH_SCOPES: [{ key: "all" }, { key: "agent" }, { key: "team" }],
  SwitchModal: () => null,
}));

jest.mock("@/features/workers/components/AgentConsole", () => ({
  AgentConsole: () => null,
}));

jest.mock("@/shared/data", () => ({
  markChatRead: jest.fn(),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock("@/shared/icons/material", () => ({
  MaterialIcon: ({ name }: { name: string }) =>
    React.createElement("span", { "data-icon": name }),
}));

function renderAutomationOverlay(
  Component: typeof CommandModal | typeof CommandDrawer,
) {
  const onClose = jest.fn();
  const html = renderToStaticMarkup(
    React.createElement(Component, {
      modal: createCommandOverlayState({ type: "automation" }),
      onPatch: jest.fn(),
      onClose,
    }),
  );
  const props = mockAutomationConsoleProps[mockAutomationConsoleProps.length - 1];
  return { html, onClose, props };
}

describe("automation command overlays", () => {
  beforeEach(() => {
    mockAutomationConsoleProps.length = 0;
    mockDispatch.mockClear();
  });

  it("keeps the standalone page as a thin wrapper around the shared console", () => {
    const html = renderToStaticMarkup(React.createElement(AutomationsPage));
    const props = mockAutomationConsoleProps[0];

    expect(html).toContain('data-testid="automation-history-console"');
    expect(props.currentWorker).toBe(mockCurrentWorker);
    expect(props.agents).toBe(mockAgents);
    expect(props.teams).toBe(mockTeams);
    expect(props.onNavigateAway).toBeUndefined();
  });

  it.each([
    ["desktop modal", CommandModal, "modal"],
    ["copilot drawer", CommandDrawer, "drawer"],
  ])("renders the shared console in the %s", (_label, Component, overlay) => {
    const { html, onClose, props } = renderAutomationOverlay(Component);

    expect(html).toContain(`data-overlay="${overlay}"`);
    expect(html).toContain('data-testid="automation-history-console"');
    expect(props.currentWorker).toBe(mockCurrentWorker);
    expect(props.agents).toBe(mockAgents);
    expect(props.teams).toBe(mockTeams);
    expect(props.embedded).toBe(true);
    expect(props.onClose).toEqual(expect.any(Function));

    expect(props.onNavigateAway).toBeUndefined();
    expect(onClose).not.toHaveBeenCalled();
  });
});
