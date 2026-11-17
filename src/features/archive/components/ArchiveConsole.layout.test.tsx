import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArchiveConsole } from "@/features/archive/components/ArchiveConsole";

const mockRuntime = {
  query: "",
  setQuery: jest.fn(),
  agents: [],
  showAgentFilter: true,
  agentFilter: "",
  setAgentFilter: jest.fn(),
  archivedRange: null,
  setArchivedRange: jest.fn(),
  createdRange: null,
  setCreatedRange: jest.fn(),
  lastRunRange: null,
  setLastRunRange: jest.fn(),
  resetFilters: jest.fn(),
  items: [],
  totalCount: 0,
  loadingList: false,
  resultText: "",
  selected: "",
  detail: null,
  loadingDetail: false,
  selectedItem: undefined,
  conversation: null,
  usageSummary: "",
  refresh: jest.fn(),
  loadArchiveDetail: jest.fn(),
  restoreSelected: jest.fn(),
  deleteSelected: jest.fn(),
  restoreGroup: jest.fn(),
  deleteGroup: jest.fn(),
};

jest.mock("@/features/archive/hooks/useArchiveRuntime", () => ({
  useArchiveRuntime: () => mockRuntime,
}));

jest.mock("@/features/archive/components/ArchiveListPane", () => ({
  ArchiveListPane: (props: { showAgentFilter?: boolean }) =>
    require("react").createElement("div", {
      "data-testid": "list-pane",
      "data-agent-scope": String(Boolean(props.showAgentFilter)),
    }),
}));

jest.mock("@/features/archive/components/ArchiveDetailPane", () => ({
  ArchiveDetailPane: () =>
    require("react").createElement("div", { "data-testid": "detail-pane" }),
}));

jest.mock("@/shared/ui/usePanelResize", () => ({
  usePanelResize: () => ({ handlePointerDown: jest.fn() }),
}));

afterEach(() => {
  mockRuntime.selected = "";
});

test("keeps the list and detail split when nothing is selected", () => {
  const markup = renderToStaticMarkup(<ArchiveConsole />);

  expect(markup).toContain('data-testid="list-pane"');
  expect(markup).toContain("--archive-list-col:280px");
  expect(markup).toContain("archive-console-resize-handle");
  expect(markup).toContain("archive-detail-empty");
  expect(markup).toContain("选择一条归档对话查看详情。");
  expect(markup).not.toContain("archive-console-centered");
  expect(markup).not.toContain("已归档聊天");
  expect(markup).not.toContain('data-testid="detail-pane"');
});

test("keeps the same split once a chat is selected", () => {
  mockRuntime.selected = "chat_1";
  const markup = renderToStaticMarkup(<ArchiveConsole />);

  expect(markup).toContain('data-testid="list-pane"');
  expect(markup).toContain('data-testid="detail-pane"');
  expect(markup).toContain("--archive-list-col:280px");
  expect(markup).toContain("archive-console-resize-handle");
  expect(markup).not.toContain("archive-detail-empty");
});

test("passes the agent scope switch to the list toolbar", () => {
  const markup = renderToStaticMarkup(<ArchiveConsole showAgentFilter />);
  expect(markup).toContain('data-agent-scope="true"');

  const embeddedMarkup = renderToStaticMarkup(<ArchiveConsole />);
  expect(embeddedMarkup).toContain('data-agent-scope="false"');
});
