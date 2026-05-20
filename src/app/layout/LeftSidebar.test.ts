import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import { LeftSidebar } from "@/app/layout/LeftSidebar";
import type { AppState, Chat, WorkerRow } from "@/app/state/types";
import { I18nProvider } from "@/shared/i18n";

const antdButtonProps: Array<Record<string, unknown>> = [];
const uiButtonProps: Array<Record<string, unknown> & { text: string }> = [];

function collectText(value: React.ReactNode): string {
  if (value === null || value === undefined || typeof value === "boolean") {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(collectText).join("");
  }
  if (React.isValidElement(value)) {
    return collectText(value.props.children);
  }
  return "";
}

jest.mock("antd", () => {
  const React = require("react");

  const Button = ({ children, icon, className, loading, ...props }: any) => {
    antdButtonProps.push({ className, ...props });
    return React.createElement(
      "button",
      { type: "button", className, ...props },
      icon,
      children,
    );
  };

  const Collapse = ({ items = [], className }: any) =>
    React.createElement(
      "div",
      { className },
      items.map((item: any) =>
        React.createElement(
          "div",
          { key: item.key, className: item.className },
          item.label,
          item.children,
        ),
      ),
    );

  const Dropdown = ({ children }: any) =>
    React.createElement(React.Fragment, null, children);

  const Flex = ({ children, className, style }: any) =>
    React.createElement("div", { className, style }, children);

  const Input = ({ className, prefix, ...props }: any) =>
    React.createElement(
      "div",
      { className },
      prefix,
      React.createElement("input", props),
    );

  const Badge = ({ children, count, dot }: any) =>
    React.createElement(
      "span",
      {
        "data-badge-count": count,
        "data-badge-dot": dot ? "true" : "false",
      },
      children,
    );

  const Modal = ({ open, title, children }: any) =>
    open
      ? React.createElement(
          "div",
          { className: "mock-modal" },
          title,
          children,
        )
      : null;
  Modal.useModal = () => [{ confirm: jest.fn() }, null];

  const Popover = ({ children, content, classNames }: any) =>
    React.createElement(
      "div",
      { className: classNames?.root },
      children,
      content,
    );

  const Spin = ({ children }: any) => React.createElement(React.Fragment, null, children);
  const Tag = ({ children }: any) => React.createElement("span", null, children);
  const Tooltip = ({ children }: any) =>
    React.createElement(React.Fragment, null, children);

  return {
    Button,
    Badge,
    Collapse,
    Dropdown,
    Flex,
    Input,
    Modal,
    Popover,
    Spin,
    Tag,
    Tooltip,
    Typography: {
      Text: ({ children }: any) => React.createElement("span", null, children),
    },
  };
});

jest.mock("antd/es/app/useApp", () => ({
  __esModule: true,
  default: () => ({
    message: {
      error: jest.fn(),
      success: jest.fn(),
    },
  }),
}));

jest.mock("@/shared/ui/UiButton", () => {
  const React = require("react");
  return {
    UiButton: React.forwardRef(
      ({ children, className = "", iconOnly, loading, ...props }: any, ref: any) => {
        uiButtonProps.push({ ...props, className, text: collectText(children) });
        return React.createElement(
          "button",
          {
            ref,
            type: props.type || "button",
            className,
            disabled: props.disabled || loading,
            ...props,
          },
          children,
        );
      },
    ),
  };
});

jest.mock("@/app/state/AppContext", () => {
  const actual = jest.requireActual("@/app/state/AppContext");
  return {
    ...actual,
    useAppContext: jest.fn(),
  };
});

jest.mock("@/shared/icons/agent", () => ({
  AgentIcon: () => React.createElement("span", null, "agent-icon"),
}));

const { useAppContext } = jest.requireMock("@/app/state/AppContext") as {
  useAppContext: jest.Mock;
};

const globalWithStorage = globalThis as typeof globalThis & {
  localStorage?: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("LeftSidebar", () => {
  function renderSidebar(): string {
    return renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { locale: "zh-CN", fallbackLocale: "zh-CN", persistLocale: false },
        React.createElement(LeftSidebar),
      ),
    );
  }

  const originalLocalStorage = globalWithStorage.localStorage;
  const globalWithWindow = globalThis as typeof globalThis & {
    window?: {
      dispatchEvent: jest.Mock;
      addEventListener: jest.Mock;
      removeEventListener: jest.Mock;
      location: {
        pathname: string;
      };
    };
    CustomEvent?: typeof CustomEvent;
  };
  const originalWindow = globalWithWindow.window;
  const originalCustomEvent = globalWithWindow.CustomEvent;

  function createWorkerState(): AppState {
    const state = createInitialState();
    const workerRow: WorkerRow = {
      key: "agent:worker_a",
      type: "agent",
      sourceId: "worker_a",
      displayName: "Alpha Agent",
      role: "Builder",
      teamAgentLabels: [],
      latestChatId: "chat_6",
      latestRunId: "run_6",
      latestUpdatedAt: 6000,
      latestChatName: "Chat 6",
      latestRunContent: "Latest reply 6",
      hasHistory: true,
      latestRunSortValue: 6000,
      searchText: "alpha agent worker_a",
    };

    const chats: Chat[] = Array.from({ length: 6 }, (_, index) => {
      const count = index + 1;
      return {
        chatId: `chat_${count}`,
        chatName: `Chat ${count}`,
        updatedAt: count * 1000,
        agentKey: "worker_a",
        firstAgentKey: "worker_a",
        lastRunId: `run_${count}`,
        lastRunContent: `Latest reply ${count}`,
        read: {
          isRead: count % 2 === 0,
        },
      };
    });

    return {
      ...state,
      conversationMode: "worker",
      leftDrawerOpen: false,
      workerSelectionKey: workerRow.key,
      workerRows: [workerRow],
      workerIndexByKey: new Map([[workerRow.key, workerRow]]),
      chats,
      agents: [
        {
          key: "worker_a",
          name: "Alpha Agent",
          stats: {
            unreadCount: 3,
          },
          icon: {
            name: "smart_toy",
            color: "#123456",
          },
        },
      ],
    };
  }

  function mockState(state: AppState) {
    useAppContext.mockReturnValue({
      state,
      dispatch: jest.fn(),
      stateRef: { current: state },
      querySessionsRef: { current: new Map() },
      chatQuerySessionIndexRef: { current: new Map() },
      activeQuerySessionRequestIdRef: { current: "" },
    });
  }

  function createChatListState(): AppState {
    const state = createInitialState();
    return {
      ...state,
      conversationMode: "chat",
      leftDrawerOpen: true,
      chats: [
        {
          chatId: "chat_pending",
          chatName: "Pending Chat",
          updatedAt: 1713781200000,
          agentKey: "worker_a",
          firstAgentKey: "worker_a",
          read: {
            isRead: false,
          },
          hasPendingAwaiting: true,
        },
      ],
      agents: [
        {
          key: "worker_a",
          name: "Alpha Agent",
          stats: {
            unreadCount: 1,
          },
        },
      ],
    };
  }

  beforeEach(() => {
    antdButtonProps.length = 0;
    uiButtonProps.length = 0;
    globalWithStorage.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    globalWithWindow.window = {
      dispatchEvent: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      location: {
        pathname: "/",
      },
    };
    globalWithWindow.CustomEvent = class CustomEventMock<T = unknown> extends Event {
      detail: T;

      constructor(type: string, params?: CustomEventInit<T>) {
        super(type);
        this.detail = params?.detail as T;
      }
    } as typeof CustomEvent;
    const state = createInitialState();
    mockState({
      ...state,
      leftDrawerOpen: true,
      transportMode: "sse",
      themeMode: "dark",
    });
    delete globalWithStorage.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (originalLocalStorage) {
      globalWithStorage.localStorage = originalLocalStorage;
      return;
    }
    delete globalWithStorage.localStorage;

    if (originalWindow) {
      globalWithWindow.window = originalWindow;
    } else {
      delete globalWithWindow.window;
    }

    if (originalCustomEvent) {
      globalWithWindow.CustomEvent = originalCustomEvent;
    } else {
      delete globalWithWindow.CustomEvent;
    }
  });

  it("does not render the settings trigger by default", () => {
    const html = renderSidebar();

    expect(html).not.toContain('id="settings-btn"');
    expect(html).not.toContain("打开设置菜单");
    expect(html).not.toContain("settings-summary-chip");
  });

  it("renders compact transport and theme summaries on the settings trigger when enabled by env", () => {
    globalWithStorage.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      SETTINGS_MENU_ENABLED: "true",
    };

    const html = renderSidebar();

    expect(html).toContain('id="settings-btn"');
    expect(html).toContain("打开设置菜单");
    expect(html).toContain(">SSE<");
    expect(html).toContain(">夜<");
    expect(html).toContain("aria-haspopup=\"menu\"");
    expect(html).toContain("settings-summary-chip");
  });

  it("does not render quick actions by default", () => {
    const html = renderSidebar();

    expect(html).not.toContain("left-sidebar-buttons");
    expect(html).not.toContain("自动化");
    expect(html).not.toContain("记忆");
  });

  it("renders quick actions when enabled by env", () => {
    globalWithStorage.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      QUICK_ACTIONS_ENABLED: "true",
    };

    const html = renderSidebar();

    expect(html).toContain("自动化");
    expect(html).toContain("记忆");
    expect(html).toContain("智能体");
    expect(html).not.toContain('data-badge-count="6"');
  });

  it("opens the agent console from the quick action", () => {
    globalWithStorage.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      QUICK_ACTIONS_ENABLED: "true",
    };
    const dispatch = jest.fn();
    const state = createInitialState();
    useAppContext.mockReturnValue({
      state: {
        ...state,
        leftDrawerOpen: true,
        agents: Array.from({ length: 20 }, (_, index) => ({
          key: `agent_${index}`,
          name: `Agent ${index}`,
        })),
      },
      dispatch,
      stateRef: { current: state },
      querySessionsRef: { current: new Map() },
      chatQuerySessionIndexRef: { current: new Map() },
      activeQuerySessionRequestIdRef: { current: "" },
    });

    renderSidebar();

    const agentsButton = uiButtonProps.find((props) => props.text.includes("智能体"));
    expect(agentsButton).toBeTruthy();
    expect(typeof agentsButton?.onClick).toBe("function");

    (agentsButton?.onClick as () => void)();

    expect(dispatch).toHaveBeenCalledWith({
      type: "OPEN_COMMAND_MODAL",
      modal: { type: "agents" },
    });
  });

  it("renders collapsed worker entries with names, popover header, and total history count", () => {
    mockState(createWorkerState());

    const html = renderSidebar();

    expect(html).toContain("worker-collapsed-name");
    expect(html).toContain("Alpha Agent");
    expect(html).toContain("worker-popover-header");
    expect(html).toContain("worker-popover-new");
    expect(html).toContain("查看更多（共 6 条，未读 3 条）");
  });

  it("shows more history from agent stats when only five chats are preloaded", () => {
    const state = createWorkerState();
    state.chats = state.chats.slice(0, 5);
    state.agents[0].stats = {
      totalCount: 12,
      unreadCount: 3,
    };
    mockState(state);

    const html = renderSidebar();

    expect(html).toContain("查看更多（共 12 条，未读 3 条）");
  });

  it("renders unread badges for worker and chat rows", () => {
    mockState(createWorkerState());

    const workerHtml = renderSidebar();
    expect(workerHtml).toContain('data-badge-dot="true"');
    expect(workerHtml).toContain("chat-unread-dot is-unread");

    mockState(createChatListState());
    const chatHtml = renderSidebar();
    expect(chatHtml).toContain("is-unread");
    expect(chatHtml).toContain("chat-unread-dot");
  });

  it("dispatches worker selection when clicking a collapsed worker entry", () => {
    mockState(createWorkerState());
    renderSidebar();

    const button = antdButtonProps.find((props) =>
      String(props.className || "").includes("worker-collapsed-icon"),
    );
    expect(button).toBeTruthy();
    expect(typeof button?.onClick).toBe("function");

    (button?.onClick as () => void)();

    const workerSelectionEvents = globalWithWindow.window?.dispatchEvent.mock.calls
      .map(([event]) => event)
      .filter(
        (event): event is CustomEvent =>
          event instanceof CustomEvent && event.type === "agent:select-worker",
      );

    expect(workerSelectionEvents).toHaveLength(1);
    expect(workerSelectionEvents[0].detail).toEqual({
      workerKey: "agent:worker_a",
      focusComposerOnComplete: true,
    });
  });

  it("renders unread chat rows in the chat list", () => {
    mockState(createChatListState());

    const html = renderSidebar();

    expect(html).toContain('class="ui-list-item is-dense chat-item  is-unread"');
    expect(html).toContain('class="chat-unread-dot is-unread"');
  });

  it("renders awaiting status before time across worker header and preview rows", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.chats[state.chats.length - 1].hasPendingAwaiting = true;
    mockState(state);

    const html = renderSidebar();

    expect(html).toContain(
      '<span class="chat-awaiting-status">等待审批</span><span class="worker-panel-time-label">',
    );
    expect(html).toContain(
      '<span class="worker-chat-item-main"><span class="worker-chat-name">Latest reply 6</span><span class="chat-awaiting-status">等待审批</span></span><span class="worker-chat-action" data-action="time">',
    );
    expect(html).toContain("worker-chat-action");
  });
});
