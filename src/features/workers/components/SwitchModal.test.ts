import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SwitchModal } from "@/features/workers/components/SwitchModal";
import type { WorkerRow } from "@/app/state/types";

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        "switch.searchPlaceholder": "Search workers",
        "switch.scopeLabel": "Worker scope",
        "switch.scope.all": "All",
        "switch.workerType.agent": "智能体",
        "switch.workerType.team": "组",
        "switch.ariaLabel": "Workers",
        "switch.preview.noHistory": "No history",
        "switch.empty": "No workers",
      })[key] || key,
  }),
}));

jest.mock("@/shared/icons/agent", () => {
  const React = require("react");
  return {
    AgentIcon: ({ type }: { type: string }) =>
      React.createElement("span", {
        className: "command-switch-worker-icon",
        "data-worker-type": type,
      }),
  };
});

function createWorkerRow(overrides: Partial<WorkerRow> = {}): WorkerRow {
  return {
    key: "agent:agent-alpha",
    type: "agent",
    sourceId: "agent-alpha",
    displayName: "Alpha",
    role: "研究员",
    teamAgentLabels: [],
    latestChatId: "chat-1",
    latestRunId: "run-1",
    latestUpdatedAt: 100,
    latestChatName: "Latest chat title",
    latestRunContent: "Latest assistant reply",
    hasHistory: true,
    latestRunSortValue: 100,
    searchText: "alpha",
    ...overrides,
  };
}

function renderSwitchModal(props: Partial<React.ComponentProps<typeof SwitchModal>> = {}) {
  return renderToStaticMarkup(
    React.createElement(SwitchModal, {
      scope: "all",
      searchText: "",
      switchRows: [createWorkerRow()],
      switchIndex: 0,
      searchInputRef: React.createRef<HTMLInputElement>(),
      switchListRef: React.createRef<HTMLDivElement>(),
      switchItemRefs: { current: [] },
      onSearchChange: jest.fn(),
      onScopeChange: jest.fn(),
      onActivateIndex: jest.fn(),
      onSelect: jest.fn(),
      ...props,
    }),
  );
}

describe("SwitchModal", () => {
  it("keeps the latest conversation preview in the default variant", () => {
    const html = renderSwitchModal();

    expect(html).toContain("Latest assistant reply");
    expect(html).toContain("agent-alpha");
    expect(html).not.toContain("command-switch-compact-row");
  });

  it("renders compact Copilot rows without latest chat content", () => {
    const html = renderSwitchModal({
      variant: "copilot",
      workerIconsByKey: new Map([
        ["agent:agent-alpha", { color: "#2563eb", name: "pulse" }],
      ]),
    });

    expect(html).toContain("command-switch-compact-row");
    expect(html).toContain("command-switch-worker-icon");
    expect(html).toContain("Alpha");
    expect(html).toContain("研究员");
    expect(html).toContain("智能体");
    expect(html).not.toContain("Latest assistant reply");
    expect(html).not.toContain("Latest chat title");
    expect(html).not.toContain("agent-alpha</span>");
    expect(html).not.toContain("No history");
  });
});
