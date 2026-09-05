import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HistoryModal } from "@/features/chats/components/HistoryModal";
import type { Chat } from "@/features/chats/lib/chatState";
import { I18nProvider, type Locale } from "@/shared/i18n";

jest.mock("antd", () => {
  const React = require("react");
  return {
    Flex: ({ children, className }: any) =>
      React.createElement("div", { className }, children),
    Input: ({ prefix, className, ...props }: any) =>
      React.createElement(
        "div",
        { className: className || "ant-input-affix-wrapper" },
        prefix,
        React.createElement("input", props),
      ),
    Popover: ({ content, children }: any) =>
      React.createElement(
        "div",
        { className: "ant-popover" },
        children,
        content,
      ),
    DatePicker: {
      RangePicker: (props: any) =>
        React.createElement(
          "div",
          { className: "ant-range-picker" },
          ...(props?.placeholder || []),
        ),
    },
    Tag: ({ children, ...props }: any) => React.createElement("span", props, children),
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

const stateChats: Chat[] = [];

jest.mock("@/app/state/provider", () => ({
  useAppContext: () => ({
    state: {
      chatId: "",
      chats: stateChats,
      chatAgentById: new Map(),
      workerSelectionKey: "agent:alpha",
      agents: [
        { key: "alpha", name: "Alpha" },
        { key: "beta", name: "Beta" },
      ],
    },
    dispatch: jest.fn(),
  }),
}));

jest.mock("@/features/chats/components/AgentSelector", () => ({
  AgentSelector: ({ value }: { value?: string[] }) =>
    React.createElement(
      "button",
      { type: "button", className: "history-worker-selector" },
      (value || []).join(","),
    ),
}));

function createHistoryChat(overrides: Partial<Chat> = {}): Chat {
  return {
    chatId: "chat-1",
    chatName: "A compact history title",
    agentKey: "alpha",
    updatedAt: 100,
    lastRunId: "run-1",
    lastRunContent: "This is a longer preview that Copilot clamps with CSS.",
    read: { isRead: false },
    ...overrides,
  };
}

function renderHistoryModal(
  chats: Chat[],
  props: Partial<React.ComponentProps<typeof HistoryModal>> = {},
  locale: Locale = "zh-CN",
) {
  stateChats.length = 0;
  stateChats.push(...chats);
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { locale, persistLocale: false },
      React.createElement(HistoryModal, {
        onSelectChat: jest.fn(),
        ...props,
      }),
    ),
  );
}

describe("HistoryModal", () => {
  it("keeps the modal layout contract instead of using the page layout", () => {
    const html = renderHistoryModal([createHistoryChat()]);

    expect(html).toContain("command-modal-section");
    expect(html).not.toContain("management-page-console");
  });

  it("renders search input, filter popover, refresh button and chat count in the modal title", () => {
    const html = renderHistoryModal([createHistoryChat()]);

    expect(html).toContain("history-modal-title");
    expect(html).toContain('placeholder="搜索对话"');
    expect(html).toContain("history-filter-trigger");
    expect(html).toContain('data-material-icon="filter_list"');
    expect(html).toContain("筛选");
    expect(html).toContain("1/2");
    expect(html).toContain("history-filter-popover");
    expect(html).toContain("智能体");
    expect(html).toContain("更新时间");
    expect(html).toContain("ant-range-picker");
    expect(html).toContain("history-worker-selector");
    expect(html).toContain('data-material-icon="refresh"');
    expect(html).toContain("共 1 条对话");
  });

  it("only lists chats that belong to the selected worker", () => {
    const html = renderHistoryModal([
      createHistoryChat(),
      createHistoryChat({
        chatId: "chat-2",
        chatName: "Another agent chat",
        agentKey: "beta",
      }),
    ]);

    expect(html).toContain("A compact history title");
    expect(html).not.toContain("Another agent chat");
  });

  it("renders mark-all-read inside toolbar actions when unread chats exist", () => {
    const html = renderHistoryModal([createHistoryChat()]);

    expect(html).toContain("command-history-toolbar");
    expect(html).toContain("command-history-toolbar-actions");
    expect(html).toContain("command-history-action");
    expect(html).toContain("一键已读");
  });

  it("renders localized history controls in English", () => {
    const html = renderHistoryModal([createHistoryChat()], {}, "en-US");

    expect(html).toContain("Mark all as read");
    expect(html).toContain('placeholder="Search Chat"');
  });

  it("renders the agent name and persistent time outside the hover actions", () => {
    const html = renderHistoryModal([createHistoryChat()]);

    expect(html).toContain("history-list-item");
    expect(html).toContain("history-list-agent-name");
    expect(html).toContain("Alpha");
    expect(html).toContain("history-list-action-time");
    expect(html).toContain("history-list-actions");
  });

  it("hides the filter trigger in the drawer variant", () => {
    const html = renderHistoryModal([createHistoryChat()], {
      titleBarVariant: "drawer",
    });

    expect(html).not.toContain("history-filter-trigger");
    expect(html).not.toContain("history-filter-popover");
    expect(html).toContain("history-modal-title");
  });

  it("shows unread, running, and awaiting statuses together when all are present", () => {
    const html = renderHistoryModal([
      createHistoryChat({
        read: { isRead: false },
        hasActiveRun: true,
        hasPendingAwaiting: true,
        awaiting: { mode: "question" },
      }),
    ]);

    expect(html).toContain("未读");
    expect(html).toContain("运行中");
    expect(html).toContain("等待回答");
    expect(html).toContain("history-list-status");
  });

  it("uses readable preview text instead of chatId when chatName is missing", () => {
    const html = renderHistoryModal([
      createHistoryChat({
        chatId: "6a9dc04b-2dcf-4d8f-812e-c521ee143000",
        chatName: "",
        lastRunContent: "Readable conversation preview",
      }),
    ]);

    expect(html).toContain("Readable conversation preview");
    expect(html).not.toContain("6a9dc04b-2dcf-4d8f-812e-c521ee143000");
  });

  it("uses the untitled label when chatName and preview are missing", () => {
    const html = renderHistoryModal([
      createHistoryChat({
        chatId: "6a9dc04b-2dcf-4d8f-812e-c521ee143000",
        chatName: "",
        lastRunContent: "",
      }),
    ]);

    expect(html).toContain("(无标题)");
    expect(html).toContain("(无预览)");
    expect(html).not.toContain("6a9dc04b-2dcf-4d8f-812e-c521ee143000");
  });

  it("shows the empty state when no chats match the worker", () => {
    const html = renderHistoryModal([]);

    expect(html).toContain("当前对象暂无匹配历史对话。");
  });
});
