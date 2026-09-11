/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { renderToStaticMarkup } from "react-dom/server";
import dayjs from "dayjs";
import { HistoryModal } from "@/features/chats/components/HistoryModal";
import type { HistoryFilter } from "@/features/chats/components/HistoryFilter";
import type { Chat } from "@/features/chats/lib/chatState";
import { I18nProvider, type Locale } from "@/shared/i18n";

const mockConfirm = jest.fn();
const mockDispatch = jest.fn();
const mockArchiveChats = jest.fn();
const mockDeleteChat = jest.fn();
const mockExportMarkdown = jest.fn();
const mockExportHtml = jest.fn();
const mockSuccess = jest.fn();
const mockError = jest.fn();
const mockButtons: Array<Record<string, any>> = [];
const mockGetChats = jest.fn();
const mockSearchGlobal = jest.fn();
let mockFilterProps: React.ComponentProps<typeof HistoryFilter>;
let mockActiveChatId = "";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/shared/data", () => ({
  ...jest.requireActual("@/shared/data"),
  getChats: (...args: unknown[]) => mockGetChats(...args),
  searchGlobal: (...args: unknown[]) => mockSearchGlobal(...args),
  archiveChats: (...args: unknown[]) => mockArchiveChats(...args),
  deleteChat: (...args: unknown[]) => mockDeleteChat(...args),
  downloadChatExport: (...args: unknown[]) => mockExportMarkdown(...args),
  downloadConversationHtmlExport: (...args: unknown[]) => mockExportHtml(...args),
}));

jest.mock("@/shared/ui/UiButton", () => {
  const original = jest.requireActual("@/shared/ui/UiButton");
  return {
    UiButton: (props: Record<string, any>) => {
      mockButtons.push(props);
      return React.createElement(original.UiButton, props);
    },
  };
});

jest.mock("antd", () => {
  const React = require("react");
  return {
    App: { useApp: () => ({ modal: jest.requireMock("antd").Modal }) },
    Flex: ({ children, className }: any) =>
      React.createElement("div", { className }, children),
    Input: React.forwardRef(({ prefix, className, variant, ...props }: any, ref: any) =>
      React.createElement(
        "div",
        { className: className || "ant-input-affix-wrapper" },
        prefix,
        React.createElement("input", { ...props, ref }),
      )),
    Tag: ({ children, ...props }: any) => React.createElement("span", props, children),
    Tooltip: ({ children }: any) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock("antd/es/app/useApp", () => ({
  __esModule: true,
  default: () => ({
    message: {
      error: (...args: unknown[]) => mockError(...args),
      success: (...args: unknown[]) => mockSuccess(...args),
    },
    modal: {
      confirm: (...args: unknown[]) => mockConfirm(...args),
    },
  }),
}));

const stateChats: Chat[] = [];

jest.mock("@/app/state/provider", () => ({
  useAppContext: () => ({
    state: {
      chatId: mockActiveChatId,
      chats: stateChats,
      chatAgentById: new Map(),
      workerSelectionKey: "agent:alpha",
      agents: [
        { key: "alpha", name: "Alpha" },
        { key: "beta", name: "Beta" },
      ],
    },
    dispatch: mockDispatch,
  }),
}));

jest.mock("@/features/chats/components/HistoryFilter", () => ({
  HistoryFilter: (props: React.ComponentProps<typeof HistoryFilter>) => {
    mockFilterProps = props;
    return React.createElement(
      "button",
      {
        type: "button",
        className: "history-filter-trigger",
        "data-filtered-count": props.filteredCount,
        "data-total-count": props.totalCount,
      },
      props.agentKey,
    );
  },
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockArchiveChats.mockReset();
    mockDeleteChat.mockReset();
    mockExportHtml.mockReset();
    mockExportMarkdown.mockReset();
    mockButtons.length = 0;
    mockActiveChatId = "";
    mockGetChats.mockResolvedValue({ data: [] });
    mockSearchGlobal.mockResolvedValue({ data: { results: [] } });
  });

  const clickAction = (icon: string) => {
    const button = mockButtons.find((props) => props.children?.props?.name === icon);
    expect(button).toBeDefined();
    const stopPropagation = jest.fn();
    button?.onClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalled();
  };

  it.each([
    ["inventory_2", "CHAT_ARCHIVED"],
    ["delete", "CHAT_DELETED"],
  ])("confirms %s and resets only after the corresponding operation succeeds", async (icon, actionType) => {
    mockActiveChatId = "chat-1";
    mockArchiveChats.mockResolvedValue({ data: { results: [{ success: true }] } });
    renderHistoryModal([createHistoryChat()]);
    clickAction(icon);
    expect(mockArchiveChats).not.toHaveBeenCalled();
    expect(mockDeleteChat).not.toHaveBeenCalled();
    const config = mockConfirm.mock.calls[0][0];
    expect(config.content).toBe("A compact history title");
    expect(Boolean(config.okButtonProps?.danger)).toBe(icon === "delete");
    await config.onOk();
    expect(mockDispatch.mock.calls.map(([action]) => action.type)).toEqual([
      actionType, "SET_CHAT_ID", "SET_RUN_ID", "RESET_ACTIVE_CONVERSATION",
    ]);
    if (icon === "delete") {
      expect(mockDeleteChat).toHaveBeenCalledWith({ chatId: "chat-1" });
      expect(mockArchiveChats).not.toHaveBeenCalled();
    } else {
      expect(mockArchiveChats).toHaveBeenCalledWith({ chatIds: ["chat-1"] });
      expect(mockDeleteChat).not.toHaveBeenCalled();
    }
  });

  it("keeps failed archive confirmation open, with no removal or active-chat reset", async () => {
    mockActiveChatId = "chat-1";
    mockArchiveChats.mockResolvedValue({ data: { results: [{ success: false, error: "denied" }] } });
    renderHistoryModal([createHistoryChat()]);
    clickAction("inventory_2");
    await expect(mockConfirm.mock.calls[0][0].onOk()).rejects.toThrow("denied");
    expect(mockDispatch.mock.calls).toEqual([[{
      type: "APPEND_DEBUG", line: "[archive chat error] denied",
    }]]);
    expect(mockError).not.toHaveBeenCalled();
  });

  it.each(["export", "html"])("keeps the %s export action and history notification", async (icon) => {
    renderHistoryModal([createHistoryChat()]);
    clickAction(icon);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(icon === "html" ? mockExportHtml : mockExportMarkdown).toHaveBeenCalledWith("chat-1");
    expect(mockSuccess).toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("keeps the modal layout contract instead of using the page layout", () => {
    const html = renderHistoryModal([createHistoryChat()]);

    expect(html).toContain("command-modal-section");
    expect(html).not.toContain("management-page-console");
  });

  it("renders the filter trigger directly beside search", () => {
    const html = renderHistoryModal([createHistoryChat()]);

    expect(html).toContain("history-modal-title");
    expect(html).toContain('placeholder="搜索对话"');
    expect(html).toContain("history-filter-trigger");
    expect(html).toContain('data-filtered-count="1"');
    expect(html).toContain('data-total-count="1"');
    expect(html).not.toContain("history-filter-popover");
    expect(html).not.toContain("ant-range-picker");
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

  it("switches between one agent and all agents, fetching the complete catalog", async () => {
    stateChats.splice(0, stateChats.length,
      createHistoryChat(),
      createHistoryChat({ chatId: "chat-beta", chatName: "Beta history", agentKey: "beta" }),
    );
    const container = document.createElement("div");
    const root = createRoot(container);
    const scrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = jest.fn();
    try {
      await act(async () => root.render(React.createElement(I18nProvider,
        { locale: "zh-CN", persistLocale: false },
        React.createElement(HistoryModal, { onSelectChat: jest.fn() }),
      )));
      expect(mockGetChats).toHaveBeenLastCalledWith({ agentKey: "alpha" });
      expect(container.textContent).not.toContain("Beta history");

      await act(async () => mockFilterProps.onAgentChange("beta"));
      expect(mockGetChats).toHaveBeenLastCalledWith({ agentKey: "beta" });
      expect(container.textContent).toContain("Beta history");
      expect(container.textContent).not.toContain("A compact history title");

      await act(async () => mockFilterProps.onAgentChange(""));
      expect(mockGetChats).toHaveBeenLastCalledWith({});
      expect(container.textContent).toContain("Beta history");
      expect(container.textContent).toContain("A compact history title");
      expect(container.textContent).toContain("共 2 条对话");
    } finally {
      act(() => root.unmount());
      HTMLElement.prototype.scrollIntoView = scrollIntoView;
    }
  });

  it("filters chats by update date range", async () => {
    const base = dayjs("2026-01-10");
    stateChats.splice(0, stateChats.length,
      createHistoryChat({ chatId: "chat-old", chatName: "Older chat", updatedAt: base.subtract(3, "day").valueOf() }),
      createHistoryChat({ chatId: "chat-new", chatName: "Newer chat", updatedAt: base.valueOf() }),
    );
    const container = document.createElement("div");
    const root = createRoot(container);
    const scrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = jest.fn();
    try {
      await act(async () => root.render(React.createElement(I18nProvider,
        { locale: "zh-CN", persistLocale: false },
        React.createElement(HistoryModal, { onSelectChat: jest.fn() }),
      )));
      expect(container.textContent).toContain("Older chat");
      expect(container.textContent).toContain("Newer chat");

      await act(async () => mockFilterProps.onDateRangeChange([base, null]));
      expect(container.textContent).not.toContain("Older chat");
      expect(container.textContent).toContain("Newer chat");

      await act(async () => mockFilterProps.onDateRangeChange([null, base.subtract(1, "day")]));
      expect(container.textContent).toContain("Older chat");
      expect(container.textContent).not.toContain("Newer chat");

      await act(async () => mockFilterProps.onReset());
      expect(container.textContent).toContain("Older chat");
      expect(container.textContent).toContain("Newer chat");
    } finally {
      act(() => root.unmount());
      HTMLElement.prototype.scrollIntoView = scrollIntoView;
    }
  });

  it("ignores late search responses after switching to another agent or all agents", async () => {
    jest.useFakeTimers();
    const pendingSearches: Array<(value: unknown) => void> = [];
    mockSearchGlobal.mockImplementation(() => new Promise((resolve) => pendingSearches.push(resolve)));
    stateChats.splice(0, stateChats.length, createHistoryChat());
    const container = document.createElement("div");
    const root = createRoot(container);
    const scrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = jest.fn();
    try {
      await act(async () => root.render(React.createElement(I18nProvider,
        { locale: "zh-CN", persistLocale: false },
        React.createElement(HistoryModal, { onSelectChat: jest.fn() }),
      )));
      act(() => Simulate.change(container.querySelector("input")!, {
        target: { value: "search" },
      } as unknown as React.ChangeEvent<HTMLInputElement>));
      act(() => jest.advanceTimersByTime(250));
      expect(mockSearchGlobal).toHaveBeenLastCalledWith({ query: "search", agentKey: "alpha", limit: 30 });
      await act(async () => mockFilterProps.onAgentChange("beta"));
      act(() => jest.advanceTimersByTime(250));
      await act(async () => pendingSearches[0]({ data: { results: [
        { chatId: "stale-alpha", chatName: "Stale alpha search", agentKey: "alpha" },
      ] } }));
      expect(container.textContent).not.toContain("Stale alpha search");

      await act(async () => mockFilterProps.onAgentChange(""));
      expect(mockGetChats).toHaveBeenLastCalledWith({});
      await act(async () => pendingSearches[1]({ data: { results: [
        { chatId: "stale-beta", chatName: "Stale beta search", agentKey: "beta" },
      ] } }));
      expect(container.textContent).not.toContain("Stale beta search");
    } finally {
      act(() => root.unmount());
      HTMLElement.prototype.scrollIntoView = scrollIntoView;
      jest.useRealTimers();
    }
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
