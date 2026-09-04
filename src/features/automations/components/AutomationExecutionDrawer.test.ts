/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  AutomationExecutionDetailResponse,
  AutomationExecutionResponse,
  ChatDetailResponse,
} from "@/shared/data";
import { AutomationExecutionDrawer } from "./AutomationExecutionDrawer";

const mockGetAutomationExecution = jest.fn();
const mockGetChat = jest.fn();
const mockBuildChatReplayProjection = jest.fn(
  (chatId: string) => ({
    state: {
      chatId,
      timelineOrder: [],
      timelineNodes: new Map(),
      events: [],
      taskItemsById: new Map(),
    },
    events: [],
    rawEventCount: 0,
    awaitingReconciliation: { matched: false, diagnostic: "" },
  }),
);

jest.mock("@/shared/data", () => ({
  getAutomationExecution: (...args: unknown[]) =>
    mockGetAutomationExecution(...args),
  getChat: (...args: unknown[]) => mockGetChat(...args),
}));

jest.mock(
  "@/features/conversation/lib/chatReplayProjection",
  () => ({
    buildChatReplayProjection: (...args: unknown[]) =>
      mockBuildChatReplayProjection(...args),
  }),
);

jest.mock(
  "@/features/conversation/components/ReadOnlyConversationTimeline",
  () => ({
    ReadOnlyConversationTimeline: (props: {
      chat: ChatDetailResponse;
    }) =>
      React.createElement(
        "div",
        {
          "data-testid": "read-only-timeline",
          "data-chat-id": props.chat.chatId,
        },
        `timeline:${props.chat.chatId}`,
      ),
  }),
);

jest.mock("@/shared/icons/agent", () => ({
  AgentIcon: () => React.createElement("span", { "data-testid": "agent-icon" }),
}));

jest.mock("@/shared/ui/MarkdownContent", () => ({
  MarkdownContent: ({ content }: { content: string }) =>
    React.createElement("div", { "data-testid": "markdown" }, content),
}));

jest.mock("@/shared/ui/MaterialIcon", () => ({
  MaterialIcon: ({ name }: { name: string }) =>
    React.createElement("span", { "data-icon": name }),
}));

jest.mock("@/shared/ui/UiButton", () => ({
  UiButton: ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: string;
    variant?: string;
  }) => React.createElement("button", props, children),
}));

jest.mock("@/shared/utils/copy", () => ({
  copyText: jest.fn(() => Promise.resolve()),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    locale: "zh-CN",
    t: (key: string) => key,
  }),
}));

jest.mock("antd", () => {
  const ReactRuntime = require("react") as typeof React;
  return {
    Drawer: ({
      open,
      title,
      children,
      onClose,
      afterOpenChange,
    }: {
      open: boolean;
      title?: React.ReactNode;
      children?: React.ReactNode;
      onClose?: () => void;
      afterOpenChange?: (open: boolean) => void;
    }) => {
      const previousOpen = ReactRuntime.useRef(false);
      ReactRuntime.useEffect(() => {
        if (previousOpen.current !== open) afterOpenChange?.(open);
        previousOpen.current = open;
      }, [open]);
      if (!open) return null;
      return ReactRuntime.createElement(
        "div",
        { role: "dialog" },
        ReactRuntime.createElement("header", null, title),
        ReactRuntime.createElement(
          "button",
          { type: "button", "aria-label": "close-drawer", onClick: onClose },
          "close",
        ),
        children,
      );
    },
    Spin: () => ReactRuntime.createElement("span", { "data-testid": "spin" }),
    Tabs: ({
      activeKey,
      onChange,
      items,
    }: {
      activeKey: string;
      onChange: (key: string) => void;
      items: Array<{ key: string; label: React.ReactNode; children: React.ReactNode }>;
    }) =>
      ReactRuntime.createElement(
        "div",
        { role: "tablist" },
        ...items.map((item) =>
          ReactRuntime.createElement(
            "button",
            {
              key: item.key,
              type: "button",
              role: "tab",
              "aria-selected": item.key === activeKey,
              onClick: () => onChange(item.key),
            },
            item.label,
          ),
        ),
        items.find((item) => item.key === activeKey)?.children,
      ),
    message: { success: jest.fn() },
  };
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function execution(
  overrides: Partial<AutomationExecutionResponse> = {},
): AutomationExecutionResponse {
  return {
    id: "execution-a",
    automationId: "automation-a",
    automationName: "Daily report",
    sourceFile: "automations/daily.yaml",
    agentKey: "agent-a",
    status: "success",
    error: "",
    zoneId: "Asia/Shanghai",
    chatId: "chat-a",
    runId: "run-a",
    finishReason: "stop",
    hasResult: true,
    startedAt: 1_710_000_000_000,
    durationMs: 1_250,
    ...overrides,
  };
}

function detail(
  item: AutomationExecutionResponse,
  overrides: Partial<AutomationExecutionDetailResponse> = {},
): AutomationExecutionDetailResponse {
  return {
    ...item,
    queryContent: "Create the report",
    resultContent: "# Report A",
    ...overrides,
  };
}

function chat(
  chatId: string,
  overrides: Partial<ChatDetailResponse> = {},
): ChatDetailResponse {
  return {
    chatId,
    agentKey: "agent-a",
    events: [],
    ...overrides,
  };
}

describe("AutomationExecutionDrawer", () => {
  let container: HTMLDivElement;
  let root: Root;
  let compactLayout = false;

  const renderDrawer = (
    item: AutomationExecutionResponse | null,
    options: {
      refreshRevision?: number;
      returnFocusRef?: React.RefObject<HTMLElement | null>;
      onClose?: () => void;
    } = {},
  ) => {
    act(() => {
      root.render(
        React.createElement(AutomationExecutionDrawer, {
          execution: item,
          agents: [{ key: "agent-a", name: "Agent A" }],
          teams: [],
          refreshRevision: options.refreshRevision,
          returnFocusRef: options.returnFocusRef,
          onClose: options.onClose || jest.fn(),
        }),
      );
    });
  };

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    compactLayout = false;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn(() => ({
        matches: compactLayout,
        media: "(max-width: 859px)",
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: jest.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("opens immediately and starts execution and chat requests in parallel", async () => {
    const item = execution({ resultPreview: "preview-only" });
    const detailRequest = deferred<{ data: AutomationExecutionDetailResponse }>();
    const chatRequest = deferred<{ data: ChatDetailResponse }>();
    mockGetAutomationExecution.mockReturnValueOnce(detailRequest.promise);
    mockGetChat.mockReturnValueOnce(chatRequest.promise);

    renderDrawer(item);

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(mockGetAutomationExecution).toHaveBeenCalledWith({
      executionId: item.id,
    });
    expect(mockGetChat).toHaveBeenCalledWith("chat-a", false);
    expect(container.querySelectorAll('[data-testid="spin"]')).toHaveLength(2);
    expect(
      container.querySelector(
        '[aria-label="automationHistory.panel.execution"] [aria-busy="true"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[aria-label="automationHistory.panel.chat"] [aria-busy="true"]',
      ),
    ).not.toBeNull();

    await act(async () => {
      detailRequest.resolve({ data: detail(item) });
      chatRequest.resolve({ data: chat("chat-a") });
      await Promise.all([detailRequest.promise, chatRequest.promise]);
    });

    expect(container.textContent).toContain("# Report A");
    expect(container.textContent).toContain("timeline:chat-a");
    expect(container.textContent).not.toContain("preview-only");
    expect(container.querySelectorAll('[data-testid="spin"]')).toHaveLength(0);
  });

  it("keeps the chat visible when execution detail fails and retries only the left panel", async () => {
    const item = execution();
    mockGetAutomationExecution.mockRejectedValueOnce(new Error("detail failed"));
    mockGetChat.mockResolvedValueOnce({ data: chat("chat-a") });

    renderDrawer(item);
    await act(async () => Promise.resolve());

    expect(container.textContent).toContain("detail failed");
    expect(container.textContent).toContain("timeline:chat-a");
    const executionPanel = container.querySelector(
      '[aria-label="automationHistory.panel.execution"]',
    );
    const retry = executionPanel?.querySelector<HTMLButtonElement>(
      '[aria-label="automationHistory.action.reload"]',
    );
    expect(retry).not.toBeNull();

    mockGetAutomationExecution.mockResolvedValueOnce({ data: detail(item) });
    await act(async () => {
      retry?.click();
      await Promise.resolve();
    });

    expect(mockGetAutomationExecution).toHaveBeenCalledTimes(2);
    expect(mockGetChat).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("# Report A");
  });

  it("keeps the result visible when chat loading fails and retries only the right panel", async () => {
    const item = execution();
    mockGetAutomationExecution.mockResolvedValueOnce({ data: detail(item) });
    mockGetChat.mockRejectedValueOnce(new Error("chat failed"));

    renderDrawer(item);
    await act(async () => Promise.resolve());

    expect(container.textContent).toContain("# Report A");
    expect(container.textContent).toContain("chat failed");
    const chatPanel = container.querySelector(
      '[aria-label="automationHistory.panel.chat"]',
    );
    const retry = chatPanel?.querySelector<HTMLButtonElement>(
      '[aria-label="automationHistory.action.reload"]',
    );
    expect(retry).not.toBeNull();

    mockGetChat.mockResolvedValueOnce({ data: chat("chat-a") });
    await act(async () => {
      retry?.click();
      await Promise.resolve();
    });

    expect(mockGetChat).toHaveBeenCalledTimes(2);
    expect(mockGetAutomationExecution).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("timeline:chat-a");
  });

  it("shows independent empty states when result and chat are missing", async () => {
    const item = execution({ chatId: undefined, runId: undefined, hasResult: true });
    mockGetAutomationExecution.mockResolvedValueOnce({
      data: detail(item, { resultContent: "", chatId: undefined }),
    });

    renderDrawer(item);
    await act(async () => Promise.resolve());

    expect(container.textContent).toContain("automationHistory.result.empty");
    expect(container.textContent).toContain(
      "automationHistory.chat.noAssociation",
    );
    expect(mockGetChat).not.toHaveBeenCalled();
  });

  it("renders a running chat snapshot without attaching to the run", async () => {
    const item = execution({ status: "running", hasResult: false });
    mockGetAutomationExecution.mockResolvedValueOnce({
      data: detail(item, { resultContent: "" }),
    });
    mockGetChat.mockResolvedValueOnce({
      data: chat("chat-a", { activeRun: { runId: "run-a" } }),
    });

    renderDrawer(item);
    await act(async () => Promise.resolve());

    const timeline = container.querySelector('[data-testid="read-only-timeline"]');
    expect(timeline?.getAttribute("data-chat-id")).toBe("chat-a");
    expect(timeline?.hasAttribute("data-target-run-id")).toBe(false);
    expect(container.textContent).toContain("automationHistory.status.running");
    expect(mockGetChat).toHaveBeenCalledWith("chat-a", false);
  });

  it("ignores late responses from a previously selected execution", async () => {
    const itemA = execution();
    const itemB = execution({
      id: "execution-b",
      automationName: "Weekly report",
      chatId: "chat-b",
      runId: "run-b",
    });
    const detailA = deferred<{ data: AutomationExecutionDetailResponse }>();
    const detailB = deferred<{ data: AutomationExecutionDetailResponse }>();
    const chatA = deferred<{ data: ChatDetailResponse }>();
    const chatB = deferred<{ data: ChatDetailResponse }>();
    mockGetAutomationExecution.mockImplementation(
      ({ executionId }: { executionId: string }) =>
        executionId === itemA.id ? detailA.promise : detailB.promise,
    );
    mockGetChat.mockImplementation((chatId: string) =>
      chatId === "chat-a" ? chatA.promise : chatB.promise,
    );

    renderDrawer(itemA);
    renderDrawer(itemB);
    await act(async () => {
      detailB.resolve({ data: detail(itemB, { resultContent: "Result B" }) });
      chatB.resolve({ data: chat("chat-b") });
      await Promise.all([detailB.promise, chatB.promise]);
    });
    expect(container.textContent).toContain("Result B");
    expect(container.textContent).toContain("timeline:chat-b");

    await act(async () => {
      detailA.resolve({ data: detail(itemA, { resultContent: "Late result A" }) });
      chatA.resolve({ data: chat("chat-a") });
      await Promise.all([detailA.promise, chatA.promise]);
    });

    expect(container.textContent).toContain("Result B");
    expect(container.textContent).toContain("timeline:chat-b");
    expect(container.textContent).not.toContain("Late result A");
    expect(container.textContent).not.toContain("timeline:chat-a");
  });

  it("ignores pending responses after the drawer closes", async () => {
    const item = execution();
    const detailRequest = deferred<{ data: AutomationExecutionDetailResponse }>();
    const chatRequest = deferred<{ data: ChatDetailResponse }>();
    mockGetAutomationExecution.mockReturnValueOnce(detailRequest.promise);
    mockGetChat.mockReturnValueOnce(chatRequest.promise);

    renderDrawer(item);
    renderDrawer(null);
    await act(async () => {
      detailRequest.resolve({ data: detail(item, { resultContent: "Late result" }) });
      chatRequest.resolve({ data: chat("chat-a") });
      await Promise.all([detailRequest.promise, chatRequest.promise]);
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mockBuildChatReplayProjection).not.toHaveBeenCalled();
  });

  it("does not reload successful data when switching compact tabs", async () => {
    compactLayout = true;
    const item = execution();
    mockGetAutomationExecution.mockResolvedValueOnce({ data: detail(item) });
    mockGetChat.mockResolvedValueOnce({ data: chat("chat-a") });

    renderDrawer(item);
    await act(async () => Promise.resolve());

    expect(
      container.querySelector('[aria-label="automationHistory.panel.execution"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="read-only-timeline"]')).toBeNull();
    const chatTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ).find((button) => button.textContent === "automationHistory.tab.chat");
    act(() => chatTab?.click());

    expect(container.querySelector('[data-testid="read-only-timeline"]')).not.toBeNull();
    expect(mockGetAutomationExecution).toHaveBeenCalledTimes(1);
    expect(mockGetChat).toHaveBeenCalledTimes(1);
  });

  it("refreshes both snapshots when the push revision changes", async () => {
    const item = execution();
    mockGetAutomationExecution.mockResolvedValue({ data: detail(item) });
    mockGetChat.mockResolvedValue({ data: chat("chat-a") });

    renderDrawer(item, { refreshRevision: 0 });
    await act(async () => Promise.resolve());
    renderDrawer(item, { refreshRevision: 1 });
    await act(async () => Promise.resolve());

    expect(mockGetAutomationExecution).toHaveBeenCalledTimes(2);
    expect(mockGetChat).toHaveBeenCalledTimes(2);
  });

  it("restores focus to the original view button after closing", async () => {
    const item = execution();
    mockGetAutomationExecution.mockResolvedValueOnce({ data: detail(item) });
    mockGetChat.mockResolvedValueOnce({ data: chat("chat-a") });
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const returnFocusRef = { current: trigger };
    const onClose = jest.fn();

    renderDrawer(item, { returnFocusRef, onClose });
    await act(async () => Promise.resolve());
    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="close-drawer"]')?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    renderDrawer(null, { returnFocusRef, onClose });

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
