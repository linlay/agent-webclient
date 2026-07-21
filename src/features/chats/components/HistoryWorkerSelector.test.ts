import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HistoryWorkerSelector } from "@/features/chats/components/HistoryWorkerSelector";
import type { WorkerRow } from "@/app/state/types";
import { I18nProvider } from "@/shared/i18n";

jest.mock("antd", () => ({
  Dropdown: ({ children, menu, ...props }: any) =>
    React.createElement(
      "div",
      props,
      children,
      menu.items.map((item: any) =>
        React.createElement("div", { key: item.key, "data-menu-key": item.key }, item.label),
      ),
    ),
}));

jest.mock("@/shared/icons/agent", () => ({
  AgentIcon: ({ type }: { type: string }) =>
    React.createElement("svg", { "data-worker-type": type }),
}));

jest.mock("@/shared/ui/MaterialIcon", () => ({
  MaterialIcon: ({ name }: { name: string }) =>
    React.createElement("svg", { "data-material-icon": name }),
}));

function createWorkerRow(overrides: Partial<WorkerRow>): WorkerRow {
  return {
    key: "agent:alpha",
    type: "agent",
    sourceId: "alpha",
    displayName: "Alpha",
    role: "--",
    teamAgentLabels: [],
    latestChatId: "",
    latestRunId: "",
    latestUpdatedAt: 0,
    latestChatName: "",
    latestRunContent: "",
    hasHistory: false,
    latestRunSortValue: -1,
    searchText: "",
    ...overrides,
  };
}

describe("HistoryWorkerSelector", () => {
  it("lists agents and teams while retaining the browsed history worker", () => {
    const agent = createWorkerRow({});
    const team = createWorkerRow({
      key: "team:ops",
      type: "team",
      sourceId: "ops",
      displayName: "Ops",
    });
    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { locale: "zh-CN", persistLocale: false },
        React.createElement(HistoryWorkerSelector, {
          worker: team,
          workerRows: [agent, team],
          workerIconsByKey: new Map([
            [agent.key, { name: "focus" }],
            [team.key, { color: "#3355aa" }],
          ]),
          onChange: jest.fn(),
        }),
      ),
    );

    expect(html).toContain("Alpha");
    expect(html).toContain("Ops");
    expect(html).not.toContain("智能体 · Alpha");
    expect(html).not.toContain("团队 · Ops");
    expect(html).toContain('data-worker-type="agent"');
    expect(html).toContain('data-worker-type="team"');
    expect(html).toContain('data-menu-key="team:ops"');
  });
});
