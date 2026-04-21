import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import { LeftSidebar } from "@/app/layout/LeftSidebar";
import type { AppState, Chat, WorkerRow } from "@/app/state/types";

const antdButtonProps: Array<Record<string, unknown>> = [];

jest.mock("antd", () => {
  const React = require("react");

  const Button = ({ children, icon, className, ...props }: any) => {
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

  const Flex = ({ children, className, style }: any) =>
    React.createElement("div", { className, style }, children);

  const Modal = ({ open, title, children }: any) =>
    open
      ? React.createElement(
          "div",
          { className: "mock-modal" },
          title,
          children,
        )
      : null;

  const Popover = ({ children, content, classNames }: any) =>
    React.createElement(
      "div",
      { className: classNames?.root },
      children,
      content,
    );

  const Spin = ({ children }: any) => React.createElement(React.Fragment, null, children);
  const Tooltip = ({ children }: any) =>
    React.createElement(React.Fragment, null, children);

  return {
    Button,
    Collapse,
    Flex,
    Modal,
    Popover,
    Spin,
    Tooltip,
    Typography: {
      Text: ({ children }: any) => React.createElement("span", null, children),
    },
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
};

describe("LeftSidebar", () => {
  const originalLocalStorage = globalWithStorage.localStorage;
  const globalWithWindow = globalThis as typeof globalThis & {
    window?: {
      dispatchEvent: jest.Mock;
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

  beforeEach(() => {
    antdButtonProps.length = 0;
    globalWithStorage.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    globalWithWindow.window = {
      dispatchEvent: jest.fn(),
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

  it("renders compact transport and theme summaries on the settings trigger", () => {
    const html = renderToStaticMarkup(React.createElement(LeftSidebar));

    expect(html).toContain('id="settings-btn"');
    expect(html).toContain("打开设置菜单");
    expect(html).toContain(">SSE<");
    expect(html).toContain(">夜<");
    expect(html).toContain("aria-haspopup=\"menu\"");
    expect(html).toContain("settings-summary-chip");
  });

  it("renders collapsed worker entries with names, popover header, and total history count", () => {
    mockState(createWorkerState());

    const html = renderToStaticMarkup(React.createElement(LeftSidebar));

    expect(html).toContain("worker-collapsed-name");
    expect(html).toContain("Alpha Agent");
    expect(html).toContain("worker-popover-header");
    expect(html).toContain("worker-popover-new");
    expect(html).toContain("查看更多（共 6 条）");
  });

  it("dispatches worker selection when clicking a collapsed worker entry", () => {
    mockState(createWorkerState());
    renderToStaticMarkup(React.createElement(LeftSidebar));

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
    });
  });
});
