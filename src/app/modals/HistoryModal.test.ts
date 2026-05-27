import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HistoryModal } from "@/app/modals/HistoryModal";
import type { WorkerConversationRow } from "@/app/state/types";

jest.mock("antd", () => {
  const React = require("react");
  return {
    Flex: ({ children, className }: any) =>
      React.createElement("div", { className }, children),
    Input: ({ prefix, ...props }: any) =>
      React.createElement(
        "div",
        { className: "ant-input-affix-wrapper" },
        prefix,
        React.createElement("input", props),
      ),
    Tag: ({ children }: any) => React.createElement("span", null, children),
    Tooltip: ({ children }: any) =>
      React.createElement(React.Fragment, null, children),
  };
});

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

jest.mock("@/app/state/provider", () => ({
  useAppContext: () => ({
    state: { chatId: "" },
    dispatch: jest.fn(),
  }),
}));

jest.mock("@/app/layout/sidebar/ChatActionsMenu", () => {
  const React = require("react");
  return {
    ChatActionsMenu: () =>
      React.createElement("button", { className: "chat-actions-menu" }, "more"),
  };
});

function createHistoryRow(overrides: Partial<WorkerConversationRow> = {}): WorkerConversationRow {
  return {
    chatId: "chat-1",
    chatName: "A compact history title",
    updatedAt: 100,
    lastRunId: "run-1",
    lastRunContent: "This is a longer preview that Copilot clamps with CSS.",
    isRead: false,
    ...overrides,
  };
}

function renderHistoryModal(
  props: Partial<React.ComponentProps<typeof HistoryModal>> = {},
) {
  return renderToStaticMarkup(
    React.createElement(HistoryModal, {
      historyRows: [createHistoryRow()],
      historyIndex: 0,
      historySearch: "",
      historyInputRef: React.createRef<HTMLInputElement>(),
      historyListRef: React.createRef<HTMLDivElement>(),
      historyItemRefs: { current: [] },
      onHistorySearchChange: jest.fn(),
      onActivateIndex: jest.fn(),
      onSelect: jest.fn(),
      onMarkAllRead: jest.fn(),
      ...props,
    }),
  );
}

describe("HistoryModal", () => {
  it("renders mark-all-read inside toolbar actions when unread chats exist", () => {
    const html = renderHistoryModal();

    expect(html).toContain("command-history-toolbar");
    expect(html).toContain("command-history-toolbar-actions");
    expect(html).toContain("command-history-action");
    expect(html).toContain("一键已读");
  });

  it("adds a targetable class for compact Copilot history titles", () => {
    const html = renderHistoryModal();

    expect(html).toContain("history-list-title");
    expect(html).toContain("A compact history title");
    expect(html).toContain("command-list-preview");
  });
});
