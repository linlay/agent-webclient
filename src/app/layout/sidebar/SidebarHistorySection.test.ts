import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarHistorySection } from "@/app/layout/sidebar/SidebarHistorySection";
import type { WorkerRow } from "@/app/state/types";
import { I18nProvider } from "@/shared/i18n";

const selectorProps: any[] = [];

jest.mock("antd", () => ({
  Flex: ({ children, className }: any) =>
    React.createElement("div", { className }, children),
  Modal: ({ open, title, children }: any) =>
    open ? React.createElement("section", { className: "history-modal" }, title, children) : null,
}));

jest.mock("@/features/chats/components/HistoryModal", () => ({
  HistoryModal: () => React.createElement("div", { className: "history-list" }),
}));

jest.mock("@/features/chats/components/HistoryWorkerSelector", () => ({
  HistoryWorkerSelector: (props: any) => {
    selectorProps.push(props);
    return React.createElement("div", { className: "history-worker-selector" }, props.worker?.displayName);
  },
}));

function createWorker(overrides: Partial<WorkerRow> = {}): WorkerRow {
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
    hasHistory: true,
    latestRunSortValue: 0,
    searchText: "",
    ...overrides,
  };
}

describe("SidebarHistorySection", () => {
  beforeEach(() => {
    selectorProps.length = 0;
  });

  it("adds the history owner selector to the sidebar history modal title", () => {
    const agent = createWorker();
    const team = createWorker({
      key: "team:ops",
      type: "team",
      sourceId: "ops",
      displayName: "Ops",
    });
    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { locale: "zh-CN", persistLocale: false },
        React.createElement(SidebarHistorySection, {
          open: true,
          historyWorker: agent,
          workerRows: [agent, team],
          historyRows: [],
          historyIndex: 0,
          historySearch: "",
          historyInputRef: React.createRef<HTMLInputElement>(),
          historyListRef: React.createRef<HTMLDivElement>(),
          historyItemRefs: { current: [] },
          onClose: jest.fn(),
          onHistoryWorkerChange: jest.fn(),
          onHistorySearchChange: jest.fn(),
          onActivateIndex: jest.fn(),
          onSelectChat: jest.fn(),
        }),
      ),
    );

    expect(html).toContain("历史会话");
    expect(html).toContain("history-worker-selector");
    expect(selectorProps[0]).toMatchObject({ worker: agent, workerRows: [agent, team] });
  });
});
