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

  it("uses readable preview text instead of chatId when chatName is missing", () => {
    const html = renderHistoryModal({
      historyRows: [
        createHistoryRow({
          chatId: "6a9dc04b-2dcf-4d8f-812e-c521ee143000",
          chatName: "",
          lastRunContent: "Readable conversation preview",
          searchSnippet: "",
        }),
      ],
    });

    expect(html).toContain("Readable conversation preview");
    expect(html).not.toContain("6a9dc04b-2dcf-4d8f-812e-c521ee143000");
  });

  it("uses the untitled label when chatName and preview are missing", () => {
    const html = renderHistoryModal({
      historyRows: [
        createHistoryRow({
          chatId: "6a9dc04b-2dcf-4d8f-812e-c521ee143000",
          chatName: "",
          lastRunContent: "",
          searchSnippet: "",
        }),
      ],
    });

    expect(html).toContain("(无标题)");
    expect(html).toContain("(无预览)");
    expect(html).not.toContain("6a9dc04b-2dcf-4d8f-812e-c521ee143000");
  });

  it("shows a loading state before remote history arrives", () => {
    const html = renderHistoryModal({
      historyRows: [],
      historyLoading: true,
    });

    expect(html).toContain("正在加载历史对话...");
    expect(html).not.toContain("当前对象暂无匹配历史对话。");
  });

  it("shows the remote history error instead of the empty state", () => {
    const html = renderHistoryModal({
      historyRows: [],
      historyError: "历史对话加载失败，请稍后重试。",
    });

    expect(html).toContain("历史对话加载失败，请稍后重试。");
    expect(html).not.toContain("当前对象暂无匹配历史对话。");
  });
});
