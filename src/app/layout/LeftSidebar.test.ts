import React from "react";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import {
  buildCoderAgentCreateRequest,
  buildKbaseAgentCreateRequest,
  LeftSidebar,
  handleCreateAgentSuccess,
} from "@/app/layout/LeftSidebar";
import {
  createWorkerChatOrderByKey,
  sortWorkerRowsForMode,
} from "@/app/layout/hooks/useLeftSidebarData";
import type { AppState, Chat, WorkerRow } from "@/app/state/types";
import { I18nProvider } from "@/shared/i18n";

const antdButtonProps: Array<Record<string, unknown>> = [];
const antdCollapseProps: Array<Record<string, unknown>> = [];
const uiButtonProps: Array<Record<string, unknown> & { text: string }> = [];
const dropdownMenuProps: Array<Record<string, unknown>> = [];
const mockModalConfirm = jest.fn();
const mockMessageSuccess = jest.fn();
const mockNavigate = jest.fn();
const mockOpenCommandOverlay = jest.fn();

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

  const Collapse = ({ items = [], className, onChange, ...props }: any) => {
    antdCollapseProps.push({ className, items, onChange, ...props });
    return React.createElement(
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
  };

  const Dropdown = ({ children, menu }: any) =>
    {
      dropdownMenuProps.push(menu);
      return React.createElement(
        "div",
        { className: "mock-dropdown" },
        children,
        menu?.items?.map((item: any) =>
          React.createElement(
            "button",
            {
              key: item.key,
              type: "button",
              disabled: item.disabled,
              onClick: (event: any) =>
                menu.onClick?.({ key: item.key, domEvent: event }),
            },
            item.icon,
            item.label,
          ),
        ),
      );
    };

  const Flex = ({ children, className, style }: any) =>
    React.createElement("div", { className, style }, children);

  const Input = ({ className, prefix, ...props }: any) =>
    React.createElement(
      "div",
      { className },
      prefix,
      React.createElement("input", props),
    );

  const Checkbox = ({ children, checked, disabled, onChange, ...props }: any) =>
    React.createElement(
      "label",
      {
        "data-checkbox-checked": checked ? "true" : "false",
        "data-checkbox-disabled": disabled ? "true" : "false",
      },
      React.createElement("input", {
        type: "checkbox",
        checked,
        disabled,
        onChange,
        ...props,
      }),
      children,
    );

  const Radio: any = ({
    children,
    value,
    checked,
    disabled,
    onChange,
    ...props
  }: any) =>
    React.createElement(
      "label",
      {
        "data-radio-value": value,
        "data-radio-disabled": disabled ? "true" : "false",
      },
      React.createElement("input", {
        type: "radio",
        value,
        checked,
        disabled,
        onChange,
        ...props,
      }),
      children,
    );
  Radio.Group = ({ children, value, defaultValue, disabled, onChange }: any) =>
    React.createElement(
      "div",
      {
        "data-radio-group-value": value ?? defaultValue,
        "data-radio-group-disabled": disabled ? "true" : "false",
      },
      React.Children.map(children, (child: any) =>
        React.isValidElement(child)
          ? React.cloneElement(child, {
              checked: child.props.value === (value ?? defaultValue),
              disabled: disabled || child.props.disabled,
              onChange,
            })
          : child,
      ),
    );

  const Select = ({ options = [], value, placeholder, disabled, onChange, style }: any) =>
    React.createElement(
      "select",
      {
        value,
        disabled,
        onChange: (event: any) => onChange?.(event.target.value),
        style,
      },
      placeholder
        ? React.createElement("option", { value: "" }, placeholder)
        : null,
      options.map((option: any) =>
        React.createElement(
          "option",
          { key: option.value, value: option.value },
          option.label,
        ),
      ),
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

  const Modal = ({ open, title, children, footer }: any) =>
    open
      ? React.createElement(
          "div",
          { className: "mock-modal" },
          title,
          children,
          footer,
        )
      : null;
  Modal.confirm = (...args: unknown[]) => mockModalConfirm(...args);
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
    Checkbox,
    Collapse,
    Dropdown,
    Flex,
    Input,
    Modal,
    Popover,
    Radio,
    Select,
    Spin,
    Tag,
    Tooltip,
    message: {
      success: (...args: unknown[]) => mockMessageSuccess(...args),
      error: jest.fn(),
    },
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

jest.mock("@/features/workers/components/CommandOverlayProvider", () => ({
  useCommandOverlayActions: () => ({
    openCommandOverlay: mockOpenCommandOverlay,
    patchCommandOverlay: jest.fn(),
    closeCommandOverlay: jest.fn(),
  }),
}));

jest.mock("@/shared/icons/agent", () => ({
  AgentIcon: () => React.createElement("span", null, "agent-icon"),
}));

jest.mock("@/shared/data/desktop/desktopFileSystem", () => ({
  selectProjectFolder: jest.fn(),
  openWorkspaceDirectory: jest.fn(),
}));

jest.mock("@/shared/data", () => ({
  createAgent: jest.fn(),
  deleteAgent: jest.fn(),
  getAgent: jest.fn(),
  getAgents: jest.fn(),
  getChats: jest.fn(),
  markChatRead: jest.fn(),
  searchGlobal: jest.fn(),
  updateAgentName: jest.fn(),
}));

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

const { useAppContext } = jest.requireMock("@/app/state/AppContext") as {
  useAppContext: jest.Mock;
};
const {
  selectProjectFolder,
  openWorkspaceDirectory,
} = jest.requireMock("@/shared/data/desktop/desktopFileSystem") as {
  selectProjectFolder: jest.Mock;
  openWorkspaceDirectory: jest.Mock;
};
const {
  createAgent,
  deleteAgent,
  getAgent,
  getAgents,
  updateAgentName,
} = jest.requireMock("@/shared/data") as {
  createAgent: jest.Mock;
  deleteAgent: jest.Mock;
  getAgent: jest.Mock;
  getAgents: jest.Mock;
  updateAgentName: jest.Mock;
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
      open: jest.Mock;
      location: {
        pathname: string;
        search: string;
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

  function mockState(
    state: AppState,
    options: { querySessions?: Map<string, Record<string, unknown>> } = {},
  ) {
    useAppContext.mockReturnValue({
      state,
      dispatch: jest.fn(),
      stateRef: { current: state },
      querySessionsRef: { current: options.querySessions || new Map() },
      chatQuerySessionIndexRef: { current: new Map() },
      activeQuerySessionRequestIdRef: { current: "" },
    });
  }

  function clickCollapsedWorkerEntry() {
    const button = antdButtonProps.find((props) =>
      String(props.className || "").includes("worker-collapsed-icon"),
    );
    expect(button).toBeTruthy();
    expect(typeof button?.onClick).toBe("function");

    (button?.onClick as () => void)();
  }

  function changeWorkerAccordion(key = "agent:worker_a") {
    const collapse = antdCollapseProps.find((props) =>
      String(props.className || "").includes("worker-collapse"),
    );
    expect(collapse).toBeTruthy();
    expect(typeof collapse?.onChange).toBe("function");

    (collapse?.onChange as (nextKey: string) => void)(key);
  }

  function dispatchedEvents(type: string): CustomEvent[] {
    return (globalWithWindow.window?.dispatchEvent.mock.calls || [])
      .map(([event]) => event)
      .filter(
        (event): event is CustomEvent =>
          event instanceof CustomEvent && event.type === type,
      );
  }

  function firstWorkerActionMenu(): {
    items?: Array<{ key?: string; disabled?: boolean; danger?: boolean; label?: React.ReactNode }>;
    onClick?: (event: { key: string; domEvent: { stopPropagation: jest.Mock } }) => void;
  } | undefined {
    return dropdownMenuProps.find((props) =>
      Array.isArray(props.items) &&
      props.items.some((item: any) => item?.key === "openWorkspace"),
    ) as
      | {
          items?: Array<{ key?: string; disabled?: boolean; danger?: boolean; label?: React.ReactNode }>;
          onClick?: (event: { key: string; domEvent: { stopPropagation: jest.Mock } }) => void;
        }
      | undefined;
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
    antdCollapseProps.length = 0;
    uiButtonProps.length = 0;
    dropdownMenuProps.length = 0;
    selectProjectFolder.mockReset();
    openWorkspaceDirectory.mockReset();
    createAgent.mockReset();
    deleteAgent.mockReset();
    getAgent.mockReset();
    getAgents.mockReset();
    updateAgentName.mockReset();
    mockModalConfirm.mockReset();
    mockMessageSuccess.mockReset();
    mockNavigate.mockReset();
    mockOpenCommandOverlay.mockReset();
    globalWithStorage.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    globalWithWindow.window = {
      dispatchEvent: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      open: jest.fn(),
      location: {
        pathname: "/",
        search: "",
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
    expect(html).toContain("icon-btn ui-icon-hover-24");
    expect(html).toMatch(
      /class="[^\"]*\bui-icon-hover-24-target\b[^\"]*" data-material-icon="settings"/,
    );
  });

  it("opens registry config in a new page from the settings menu", () => {
    globalWithStorage.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      SETTINGS_MENU_ENABLED: "true",
    };

    renderSidebar();

    const registriesButton = uiButtonProps.find((props) =>
      props.text.includes("注册配置"),
    );
    expect(registriesButton).toBeTruthy();
    expect(typeof registriesButton?.onClick).toBe("function");

    (registriesButton?.onClick as () => void)();

    expect(globalWithWindow.window?.open).toHaveBeenCalledWith(
      "/registries",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("opens skills in a new page from the settings menu and preserves the current search string", () => {
    globalWithStorage.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      SETTINGS_MENU_ENABLED: "true",
    };
    globalWithWindow.window!.location.search = "?lang=zh-CN";

    renderSidebar();

    const skillsButton = uiButtonProps.find((props) =>
      props.text.includes("技能"),
    );
    expect(skillsButton).toBeTruthy();

    (skillsButton?.onClick as () => void)();

    expect(globalWithWindow.window?.open).toHaveBeenCalledWith(
      "/skills?lang=zh-CN",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("preserves the current search string when opening registry config in a new page", () => {
    globalWithStorage.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      SETTINGS_MENU_ENABLED: "true",
    };
    globalWithWindow.window!.location.search = "?lang=zh-CN";

    renderSidebar();

    const registriesButton = uiButtonProps.find((props) =>
      props.text.includes("注册配置"),
    );
    expect(registriesButton).toBeTruthy();

    (registriesButton?.onClick as () => void)();

    expect(globalWithWindow.window?.open).toHaveBeenCalledWith(
      "/registries?lang=zh-CN",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("opens archives in a new page from the settings menu and preserves the current search string", () => {
    globalWithStorage.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      SETTINGS_MENU_ENABLED: "true",
    };
    globalWithWindow.window!.location.search = "?lang=zh-CN";

    renderSidebar();

    const archiveButton = uiButtonProps.find((props) =>
      props.text.includes("归档"),
    );
    expect(archiveButton).toBeTruthy();

    (archiveButton?.onClick as () => void)();

    expect(globalWithWindow.window?.open).toHaveBeenCalledWith(
      "/archives?lang=zh-CN",
      "_blank",
      "noopener,noreferrer",
    );
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
      MEMORY_ENABLED: "true",
    };

    const html = renderSidebar();

    expect(html).toContain("自动化");
    expect(html).toContain("记忆");
    expect(html).toContain("智能体");
    expect(html).not.toContain('data-badge-count="6"');
    expect(html).toContain('data-material-icon="smart_toy"');
    expect(html).not.toContain('data-material-icon="robot_2"');
    expect(html).toMatch(
      /class="[^\"]*\bui-icon-hover-24-target\b[^\"]*" data-material-icon="psychology"/,
    );
    expect(html).toMatch(
      /class="[^\"]*\bui-icon-hover-24-target\b[^\"]*" data-material-icon="smart_toy"/,
    );
    expect(html).toContain("sidebar-static-icon");
    expect(html).toMatch(
      /class="ui-icon-hover-24"[^>]*><span class="material-icon" data-material-icon="list_arrow"/,
    );
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

    expect(mockOpenCommandOverlay).toHaveBeenCalledWith({ type: "agents" });
  });

  it("sorts Agent and Team rows by their latest chat updatedAt", () => {
    const alpha: WorkerRow = {
      key: "agent:alpha",
      type: "agent",
      sourceId: "alpha",
      displayName: "Alpha",
      role: "",
      teamAgentLabels: [],
      latestChatId: "chat_alpha",
      latestRunId: "run_alpha",
      latestUpdatedAt: 100,
      latestChatName: "Alpha chat",
      latestRunContent: "",
      hasHistory: true,
      latestRunSortValue: 100,
      searchText: "alpha",
    };
    const beta: WorkerRow = {
      ...alpha,
      key: "agent:beta",
      sourceId: "beta",
      displayName: "Beta",
      latestChatId: "chat_beta",
      latestRunId: "run_beta",
      latestUpdatedAt: 200,
      latestChatName: "Beta chat",
      latestRunSortValue: 200,
      searchText: "beta",
    };
    const ops: WorkerRow = {
      ...alpha,
      key: "team:ops",
      type: "team",
      sourceId: "ops",
      displayName: "Ops",
      latestChatId: "chat_ops",
      latestRunId: "run_ops",
      latestUpdatedAt: 200,
      latestChatName: "Ops chat",
      searchText: "ops",
    };
    const empty: WorkerRow = {
      ...alpha,
      key: "agent:empty",
      sourceId: "empty",
      displayName: "Empty",
      latestChatId: "",
      latestRunId: "",
      latestUpdatedAt: 0,
      latestChatName: "",
      hasHistory: false,
      latestRunSortValue: -1,
      searchText: "empty",
    };
    const rows = [alpha, ops, beta, empty];
    const workerBaseOrderByKey = new Map(rows.map((row, index) => [row.key, index]));
    const agentOrderByKey = new Map([
      ["agent:alpha", 0],
      ["agent:beta", 1],
      ["agent:empty", 2],
    ]);
    const workerChatOrderByKey = createWorkerChatOrderByKey([
      {
        chatId: "chat_alpha",
        agentKey: "alpha",
        updatedAt: 1760000000000,
      } as Chat,
      {
        chatId: "chat_ops",
        teamId: "ops",
        updatedAt: 1761000000000,
      } as Chat,
      {
        chatId: "chat_beta",
        agentKey: "beta",
        updatedAt: 1762000000000,
      } as Chat,
    ]);

    expect(
      sortWorkerRowsForMode(rows, {
        agentOrderByKey,
        workerBaseOrderByKey,
        workerChatOrderByKey,
        workerSortMode: "byTime",
      }).map((row) => row.key),
    ).toEqual(["agent:beta", "team:ops", "agent:alpha", "agent:empty"]);
    expect(
      sortWorkerRowsForMode(rows, {
        agentOrderByKey,
        workerBaseOrderByKey,
        workerChatOrderByKey,
        workerSortMode: "byName",
      }).map((row) => row.key),
    ).toEqual(["agent:alpha", "agent:beta", "agent:empty", "team:ops"]);
  });

  it("uses chatId to break updatedAt ties and keeps invalid timestamps oldest", () => {
    const orderByKey = createWorkerChatOrderByKey([
      { chatId: "chat_z", agentKey: "z", updatedAt: 1761000000000 } as Chat,
      { chatId: "chat_a", teamId: "ops", updatedAt: 1761000000000 } as Chat,
      { chatId: "chat_invalid", agentKey: "invalid", updatedAt: "invalid" } as Chat,
    ]);

    expect([...orderByKey.keys()]).toEqual([
      "team:ops",
      "agent:z",
      "agent:invalid",
    ]);
  });

  it("keeps a temporary pinned agent first before applying the selected sort mode", () => {
    const alpha: WorkerRow = {
      key: "agent:alpha",
      type: "agent",
      sourceId: "alpha",
      displayName: "Alpha",
      role: "",
      teamAgentLabels: [],
      latestChatId: "chat_alpha",
      latestRunId: "run_alpha",
      latestUpdatedAt: 100,
      latestChatName: "Alpha chat",
      latestRunContent: "",
      hasHistory: true,
      latestRunSortValue: 100,
      searchText: "alpha",
    };
    const beta: WorkerRow = {
      ...alpha,
      key: "agent:beta",
      sourceId: "beta",
      displayName: "Beta",
      latestChatId: "chat_beta",
      latestRunId: "run_beta",
      latestUpdatedAt: 300,
      latestChatName: "Beta chat",
      latestRunSortValue: 300,
      searchText: "beta",
    };
    const gamma: WorkerRow = {
      ...alpha,
      key: "agent:gamma",
      sourceId: "gamma",
      displayName: "Gamma",
      latestChatId: "chat_gamma",
      latestRunId: "run_gamma",
      latestUpdatedAt: 200,
      latestChatName: "Gamma chat",
      latestRunSortValue: 200,
      searchText: "gamma",
    };
    const rows = [alpha, beta, gamma];
    const workerBaseOrderByKey = new Map(rows.map((row, index) => [row.key, index]));
    const agentOrderByKey = new Map([
      ["agent:gamma", 0],
      ["agent:beta", 1],
      ["agent:alpha", 2],
    ]);
    const workerChatOrderByKey = createWorkerChatOrderByKey([
      { chatId: "chat_alpha", agentKey: "alpha", updatedAt: 1760000000000 } as Chat,
      { chatId: "chat_beta", agentKey: "beta", updatedAt: 1762000000000 } as Chat,
      { chatId: "chat_gamma", agentKey: "gamma", updatedAt: 1761000000000 } as Chat,
    ]);

    expect(
      sortWorkerRowsForMode(rows, {
        agentOrderByKey,
        temporaryPinnedAgentKey: "alpha",
        workerBaseOrderByKey,
        workerChatOrderByKey,
        workerSortMode: "byTime",
      }).map((row) => row.key),
    ).toEqual(["agent:alpha", "agent:beta", "agent:gamma"]);
    expect(
      sortWorkerRowsForMode(rows, {
        agentOrderByKey,
        temporaryPinnedAgentKey: "alpha",
        workerBaseOrderByKey,
        workerChatOrderByKey,
        workerSortMode: "byName",
      }).map((row) => row.key),
    ).toEqual(["agent:alpha", "agent:gamma", "agent:beta"]);
    expect(
      sortWorkerRowsForMode(rows, {
        agentOrderByKey,
        temporaryPinnedAgentKey: "missing",
        workerBaseOrderByKey,
        workerChatOrderByKey,
        workerSortMode: "byTime",
      }).map((row) => row.key),
    ).toEqual(["agent:beta", "agent:gamma", "agent:alpha"]);
  });

  it("builds a coder project create request from workspace metadata", () => {
    expect(
      buildCoderAgentCreateRequest("/Users/demo/Project/agent-coder", {
        name: "agent-coder",
      }),
    ).toEqual({
      definition: {
        name: "agent-coder",
        mode: "CODER",
        runtimeConfig: {
          workspaceRoot: "/Users/demo/Project/agent-coder",
        },
      },
    });
    const acpRequest = buildCoderAgentCreateRequest(
      "/Users/demo/Project/acp-coder",
      {
        name: "ACP Coder",
        acpBridgeId: "proxy-acp-codex",
      },
    );
    expect(acpRequest).toEqual({
      definition: {
        name: "ACP Coder",
        mode: "CODER",
        runtimeConfig: {
          workspaceRoot: "/Users/demo/Project/acp-coder",
          acpBridgeId: "proxy-acp-codex",
        },
      },
    });
    expect(JSON.stringify(acpRequest)).not.toContain("coderBackend");
  });

  it("builds a minimal kbase project create request", () => {
    const result = buildKbaseAgentCreateRequest(
      "/Users/demo/Knowledge/my-project",
      { name: "My KB" },
    );
    expect(result).toEqual({
      definition: {
        name: "My KB",
        mode: "KBASE",
        runtimeConfig: {
          workspaceRoot: "/Users/demo/Knowledge/my-project",
        },
      },
    });
    expect(result).not.toHaveProperty("key");
    expect(result.definition).not.toHaveProperty("key");
    expect(result.definition).not.toHaveProperty("icon");
    expect(result.definition).not.toHaveProperty("workspace");
    expect(result.definition).not.toHaveProperty("kbaseConfig");
    expect(JSON.stringify(result)).not.toContain("openai");
  });

  it("renders the top action as new project and opens the create modal without calling selectProjectFolder", () => {
    const dispatch = jest.fn();
    const state = createInitialState();
    useAppContext.mockReturnValue({
      state: {
        ...state,
        leftDrawerOpen: true,
        conversationMode: "worker",
      },
      dispatch,
      stateRef: { current: state },
      querySessionsRef: { current: new Map() },
      chatQuerySessionIndexRef: { current: new Map() },
      activeQuerySessionRequestIdRef: { current: "" },
    });

    const html = renderSidebar();

    expect(html).toContain('aria-label="新建项目"');
    const button = uiButtonProps.find((props) => props.id === "top-nav-new-chat-btn");
    expect(button).toBeTruthy();
    expect(typeof button?.onClick).toBe("function");

    (button?.onClick as () => void)();

    expect(selectProjectFolder).not.toHaveBeenCalled();
    expect(createAgent).not.toHaveBeenCalled();
    expect(getAgents).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_WORKER_SELECTION_KEY" }),
    );
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_TEMPORARY_PINNED_AGENT_KEY" }),
    );
  });

  it("opens the create flow from a browser path selection via modal", async () => {
    const dispatch = jest.fn();
    const state = createInitialState();
    const createdAgent = {
      key: "browser-coder",
      name: "browser-coder",
      type: "coder",
      workspaceDir: "/Users/demo/Project/browser-coder",
    };
    createAgent.mockResolvedValue({ data: createdAgent });
    getAgents.mockResolvedValue({ data: [createdAgent] });
    useAppContext.mockReturnValue({
      state: {
        ...state,
        leftDrawerOpen: true,
        conversationMode: "worker",
      },
      dispatch,
      stateRef: { current: state },
      querySessionsRef: { current: new Map() },
      chatQuerySessionIndexRef: { current: new Map() },
      activeQuerySessionRequestIdRef: { current: "" },
    });

    renderSidebar();

    const button = uiButtonProps.find((props) => props.id === "top-nav-new-chat-btn");
    (button?.onClick as () => void)();

    expect(selectProjectFolder).not.toHaveBeenCalled();
    expect(createAgent).not.toHaveBeenCalled();
  });

  it("handleCreateAgentSuccess dispatches list refresh without navigating", async () => {
    const dispatch = jest.fn();
    const state = createInitialState();
    const stateRef = { current: state };
    const createdKey = "browser-coder";

    const agentsData = [
      { key: "browser-coder", name: "Browser Coder" },
    ];
    getAgents.mockResolvedValue({ data: agentsData });

    await handleCreateAgentSuccess(createdKey, dispatch, stateRef);

    // 调用了 createAgent → getAgents 刷新列表
    expect(getAgents).toHaveBeenCalledWith({
      includeChats: 5,
      includeTeam: true,
      scope: "nav",
    });

    // dispatch 了临时置顶
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_TEMPORARY_PINNED_AGENT_KEY",
      agentKey: createdKey,
    });

    // dispatch 了 SET_AGENTS
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_AGENTS",
      agents: agentsData,
    });

    // dispatch 了 SET_WORKER_ROWS
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_WORKER_ROWS" }),
    );

    // 没有调用 navigate
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("renders collapsed worker entries with names, popover header, and total history count", () => {
    mockState(createWorkerState());

    const html = renderSidebar();

    expect(html).toContain("worker-collapsed-name");
    expect(html).toContain("Alpha Agent");
    expect(html).toContain("worker-popover-header");
    expect(html).toContain("worker-popover-new");
    expect(html).not.toContain("ui-icon-hover-20");
    expect(html).toContain("worker-panel-new worker-popover-new");
    expect(html).toContain("worker-popover-new tw:!inline-flex tw:!h-6 tw:!w-6 tw:text-text-muted ui-icon-hover-24");
    expect(html).toContain("查看更多（共 6 条，未读 3 条）");
    const moreClass = html.match(/class="([^"]*\bworker-chat-more\b[^"]*)"/)?.[1] || "";
    expect(moreClass).toContain("tw:text-[12px]");
    expect(moreClass).not.toContain("tw:text-xs");
    expect(html).toMatch(
      /class="[^"]*\bworker-chat-more\b(?![^"tw:]*hover:text-text-main)[^"]*"/,
    );
    const workerStyles = fs.readFileSync(
      path.join(process.cwd(), "src", "shared", "styles", "globals", "workers.css"),
      "utf8",
    );
    expect(workerStyles).toMatch(
      /\.worker-chat-more:hover\s*\{[\s\S]*?color:\s*var\(--text-main\);/,
    );
  });

  it("renders and opens a worker workspace action when workspaceDir is available", async () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.workerRows[0].agentType = "coder";
    state.workerRows[0].role = "Code worker";
    state.workerRows[0].workspaceDir = "/Users/demo/Project/agent-coder";
    state.agents[0].type = "coder";
    state.agents[0].role = "Code worker";
    state.agents[0].workspaceDir = "/Users/demo/Project/agent-coder";
    openWorkspaceDirectory.mockResolvedValue(true);
    mockState(state);

    const html = renderSidebar();

    expect(html).toContain("打开工作目录");
    expect(html).not.toContain("Code worker");
    const menu = dropdownMenuProps.find((props) =>
      Array.isArray(props.items) &&
      props.items.some((item: any) => item?.key === "openWorkspace"),
    ) as { onClick?: (event: { key: string; domEvent: { stopPropagation: jest.Mock } }) => void } | undefined;
    expect(menu?.onClick).toBeTruthy();

    menu?.onClick?.({
      key: "openWorkspace",
      domEvent: { stopPropagation: jest.fn() },
    });
    await Promise.resolve();

    expect(openWorkspaceDirectory).toHaveBeenCalledWith(
      "/Users/demo/Project/agent-coder",
      "worker_a",
    );
  });

  it("renders agent action menu items without delete for non-coder agents", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.workerRows[0].agentType = "agent";
    mockState(state);

    const html = renderSidebar();
    const menu = firstWorkerActionMenu();

    expect(html).toContain("打开工作目录");
    expect(menu?.items?.map((item) => item.key)).toEqual([
      "openWorkspace",
      "renameAgent",
      "editAgent",
      "copyAgent",
    ]);
    expect(html).toContain("修改名称");
    expect(html).toContain("编辑智能体");
    expect(html).toContain("复制信息");
    expect(html).not.toContain("删除智能体");
  });

  it("renders delete in the action menu for coder agents", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.workerRows[0].agentType = "coder";
    mockState(state);

    const html = renderSidebar();
    const menu = firstWorkerActionMenu();

    expect(html).toContain("删除智能体");
    expect(menu?.items?.map((item) => item.key)).toEqual([
      "openWorkspace",
      "renameAgent",
      "editAgent",
      "copyAgent",
      "deleteAgent",
    ]);
    expect(menu?.items?.find((item) => item.key === "deleteAgent")?.danger).toBe(true);
  });

  it("keeps copy information after edit in both agent menu variants and loads details", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.workerRows[0].agentType = "coder";
    mockState(state);
    getAgent.mockReturnValue(new Promise(() => undefined));

    renderSidebar();
    const expandedMenus = dropdownMenuProps.filter((props) =>
      Array.isArray(props.items) &&
      props.items.some((item: any) => item?.key === "openWorkspace"),
    );

    expect(expandedMenus).toHaveLength(1);
    expandedMenus.forEach((menu) => {
      expect(menu.items.map((item: any) => item.key)).toEqual([
        "openWorkspace",
        "renameAgent",
        "editAgent",
        "copyAgent",
        "deleteAgent",
      ]);
    });

    dropdownMenuProps.length = 0;
    state.leftDrawerOpen = false;
    mockState(state);
    renderSidebar();
    const collapsedMenus = dropdownMenuProps.filter((props) =>
      Array.isArray(props.items) &&
      props.items.some((item: any) => item?.key === "openWorkspace"),
    );
    expect(collapsedMenus).toHaveLength(1);
    expect(collapsedMenus[0].items.map((item: any) => item.key)).toEqual([
      "openWorkspace",
      "renameAgent",
      "editAgent",
      "copyAgent",
      "deleteAgent",
    ]);

    const stopPropagation = jest.fn();
    collapsedMenus[0].onClick({
      key: "copyAgent",
      domEvent: { stopPropagation },
    });

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(getAgent).toHaveBeenCalledWith("worker_a");
  });

  it("opens the agent editor in a new page with the current search string", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.workerRows[0].sourceId = "worker/a";
    globalWithWindow.window!.location.search = "?lang=zh-CN";
    mockState(state);

    renderSidebar();
    const menu = firstWorkerActionMenu();

    menu?.onClick?.({
      key: "editAgent",
      domEvent: { stopPropagation: jest.fn() },
    });

    expect(globalWithWindow.window?.open).toHaveBeenCalledWith(
      "/agents/worker%2Fa?lang=zh-CN",
      "_blank",
    );
  });

  it("renames an agent through the lightweight update-name endpoint", async () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    mockState(state);
    updateAgentName.mockResolvedValue({ data: { key: "worker_a", name: "Beta Agent" } });

    renderSidebar();
    const menu = firstWorkerActionMenu();
    menu?.onClick?.({
      key: "renameAgent",
      domEvent: { stopPropagation: jest.fn() },
    });

    expect(mockModalConfirm).toHaveBeenCalledTimes(1);
    const confirmConfig = mockModalConfirm.mock.calls[0][0];
    const modalStyles = fs.readFileSync(
      path.join(process.cwd(), "src", "shared", "styles", "globals", "modal.css"),
      "utf8",
    );
    expect(confirmConfig.content.props.className).toBe("left-sidebar-rename-agent-input");
    expect(modalStyles).toMatch(
      /\.left-sidebar-rename-agent-input\.ant-input\s*\{[\s\S]*?border:\s*1px solid var\(--line-soft\)\s*!important;/,
    );
    expect(modalStyles).toMatch(
      /\.left-sidebar-rename-agent-input\.ant-input:focus\s*\{[\s\S]*?border-color:\s*var\(--accent-electric\)\s*!important;/,
    );
    confirmConfig.content.props.onChange({
      target: { value: "Beta Agent" },
    });
    await confirmConfig.onOk();

    expect(getAgent).not.toHaveBeenCalled();
    expect(updateAgentName).toHaveBeenCalledWith({
      key: "worker_a",
      name: "Beta Agent",
    });
    expect(mockMessageSuccess).toHaveBeenCalledWith("名称已修改");
    expect(globalWithWindow.window?.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "agent:refresh-worker-data" }),
    );
  });

  it("renames through update-name even when the agent has a rich definition", async () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    mockState(state);
    updateAgentName.mockResolvedValue({ data: { key: "worker_a", name: "Beta Agent" } });

    renderSidebar();
    firstWorkerActionMenu()?.onClick?.({
      key: "renameAgent",
      domEvent: { stopPropagation: jest.fn() },
    });

    const confirmConfig = mockModalConfirm.mock.calls[0][0];
    confirmConfig.content.props.onChange({
      target: { value: "Beta Agent" },
    });
    await confirmConfig.onOk();

    expect(getAgent).not.toHaveBeenCalled();
    expect(updateAgentName).toHaveBeenCalledWith({
      key: "worker_a",
      name: "Beta Agent",
    });
  });

  it("deletes a coder agent after confirmation and refreshes worker data", async () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.workerRows[0].agentType = "coder";
    mockState(state);
    deleteAgent.mockResolvedValue({ data: { deleted: true } });

    renderSidebar();
    firstWorkerActionMenu()?.onClick?.({
      key: "deleteAgent",
      domEvent: { stopPropagation: jest.fn() },
    });

    expect(mockModalConfirm).toHaveBeenCalledTimes(1);
    const confirmConfig = mockModalConfirm.mock.calls[0][0];
    await confirmConfig.onOk();

    expect(deleteAgent).toHaveBeenCalledWith({ key: "worker_a" });
    expect(globalWithWindow.window?.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "agent:refresh-worker-data" }),
    );
  });

  it("renders react worker roles in the worker header", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.workerRows[0].agentType = "agent";
    state.workerRows[0].role = "Operations assistant";
    mockState(state);

    const html = renderSidebar();

    expect(html).toContain("worker-panel-role");
    expect(html).toContain("Operations assistant");
  });

  it("shows browser folder coder workspace names without enabling local open", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.workerRows[0].agentType = "coder";
    state.workerRows[0].role = "";
    state.workerRows[0].workspaceDir = undefined;
    state.workerRows[0].workspaceName = "browser-coder";
    state.workerRows[0].workspaceSourceKind = "browser-folder";
    mockState(state);

    const html = renderSidebar();

    const menu = dropdownMenuProps.find((props) =>
      Array.isArray(props.items) &&
      props.items.some((item: any) => item?.key === "openWorkspace"),
    ) as { items?: Array<{ key?: string; disabled?: boolean }> } | undefined;
    expect(menu?.items?.find((item) => item.key === "openWorkspace")?.disabled).toBe(true);
  });

  it("hides empty agent roles instead of rendering a placeholder", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.workerRows[0].role = "";
    mockState(state);

    const html = renderSidebar();

    expect(html).not.toContain("worker-panel-role");
    expect(html).not.toContain("&quot;--&quot;");
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
    expect(workerHtml).toMatch(/chat-unread-dot[^"]*\bis-unread\b[^"]*\btw:opacity-100\b/);

    mockState(createChatListState());
    const chatHtml = renderSidebar();
    expect(chatHtml).toContain("is-unread");
    expect(chatHtml).toContain("chat-unread-dot");
  });

  it("marks accordion worker selection as preferring a new chat", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    mockState(state);
    renderSidebar();

    changeWorkerAccordion();

    const workerSelectionEvents = dispatchedEvents("agent:select-worker");
    expect(workerSelectionEvents).toHaveLength(1);
    expect(workerSelectionEvents[0].detail).toEqual({
      workerKey: "agent:worker_a",
      focusComposerOnComplete: true,
      preferNewChat: true,
    });
  });

  it("starts a new conversation when only older chats are unread on collapsed worker click", () => {
    mockState(createWorkerState());
    renderSidebar();

    clickCollapsedWorkerEntry();

    const startEvents = dispatchedEvents("agent:start-new-conversation");
    expect(startEvents).toHaveLength(1);
    expect(startEvents[0].detail).toEqual({
      agentKey: "worker_a",
      preserveWorkerContext: true,
      focusComposerOnComplete: true,
    });
    expect(dispatchedEvents("agent:load-chat")).toHaveLength(0);
    expect(dispatchedEvents("agent:select-worker")).toHaveLength(0);
  });

  it("loads the latest chat when collapsed worker latest chat is unread", () => {
    const state = createWorkerState();
    state.chats = state.chats.map((chat) =>
      chat.chatId === "chat_6"
        ? {
            ...chat,
            read: {
              isRead: false,
            },
          }
        : chat,
    );
    mockState(state);
    renderSidebar();

    clickCollapsedWorkerEntry();

    const loadEvents = dispatchedEvents("agent:load-chat");
    expect(loadEvents).toHaveLength(1);
    expect(loadEvents[0].detail).toEqual({
      chatId: "chat_6",
      focusComposerOnComplete: true,
    });
    expect(dispatchedEvents("agent:start-new-conversation")).toHaveLength(0);
  });

  it("loads the latest chat when collapsed worker latest chat is awaiting", () => {
    const state = createWorkerState();
    state.chats = state.chats.map((chat) =>
      chat.chatId === "chat_6"
        ? {
            ...chat,
            hasPendingAwaiting: true,
            read: {
              isRead: true,
            },
          }
        : chat,
    );
    mockState(state);
    renderSidebar();

    clickCollapsedWorkerEntry();

    const loadEvents = dispatchedEvents("agent:load-chat");
    expect(loadEvents).toHaveLength(1);
    expect(loadEvents[0].detail).toEqual({
      chatId: "chat_6",
      focusComposerOnComplete: true,
    });
    expect(dispatchedEvents("agent:start-new-conversation")).toHaveLength(0);
  });

  it("loads an older running chat when collapsed worker is clicked", () => {
    const state = createWorkerState();
    state.chats = state.chats.map((chat) =>
      chat.chatId === "chat_5"
        ? {
            ...chat,
            hasActiveRun: true,
            read: {
              isRead: true,
            },
          }
        : chat,
    );
    mockState(state);
    renderSidebar();

    clickCollapsedWorkerEntry();

    const loadEvents = dispatchedEvents("agent:load-chat");
    expect(loadEvents).toHaveLength(1);
    expect(loadEvents[0].detail).toEqual({
      chatId: "chat_5",
      focusComposerOnComplete: true,
    });
    expect(dispatchedEvents("agent:start-new-conversation")).toHaveLength(0);
  });

  it("renders unread chat rows in the chat list", () => {
    mockState(createChatListState());

    const html = renderSidebar();

    expect(html).toContain('class="ui-list-item is-dense chat-item  is-unread"');
    expect(html).toMatch(
      /class="[^"]*\bchat-unread-dot\b[^"]*\bis-unread\b[^"]*\btw:opacity-100\b[^"]*"/,
    );
  });

  it("renders an automation source icon before worker chat time", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.chats[state.chats.length - 1].source = "automation:daily";
    mockState(state);

    const html = renderSidebar();

    expect(html).toContain("worker-chat-source-icon");
    expect(html).toContain('aria-label="自动化创建"');
    expect(html).toContain('title="自动化创建"');
    expect(html).toContain("tw:h-[9px]");
    expect(html).toContain("tw:w-[9px]");
    expect(html).toContain("tw:text-[10px]");
    expect(html).toContain('<circle cx="12" cy="12" r="10"></circle>');
    expect(html).toContain('<path d="M12 6v6l4 2"></path>');
    expect(html).toMatch(
      /<span class="[^"]*\bworker-chat-name\b[^"]*">Latest reply 6<\/span><span class="[^"]*\bworker-chat-action\b[^"]*" data-action="time">[\s\S]*?<span class="[^"]*\bworker-panel-time-label\b[^"]*"><span class="[^"]*\bworker-panel-time-content\b[^"]*\bis-automation\b[^"]*"><span class="[^"]*\bworker-chat-source-icon\b[\s\S]*?<\/svg><\/span><span class="[^"]*\bworker-panel-time-text\b[^"]*tw:text-\[10px\][^"]*">/,
    );
  });

  it("does not render the automation source icon for query worker chats", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.chats[state.chats.length - 1].source = "query:user_1";
    mockState(state);

    const html = renderSidebar();

    expect(html).not.toContain("worker-chat-source-icon");
    expect(html).toMatch(
      /<span class="[^"]*\bworker-chat-name\b[^"]*">Latest reply 6<\/span><span class="[^"]*\bworker-chat-action\b[^"]*" data-action="time">/,
    );
  });

  it("shows running status in folded accordion header for the latest active run chat", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.chats = state.chats.map((chat) =>
      chat.chatId === "chat_6"
        ? {
            ...chat,
            hasActiveRun: true,
          }
        : chat,
    );
    mockState(state);

    const html = renderSidebar();

    expect(html).toMatch(
      /<div class="worker-panel-preview"><span>Latest reply 6<\/span><span class="material-icon [^"]*\bworker-chat-loading\b[^"]*\btw:animate-ui-spin\b[^"]*" data-material-icon="progress_activity">/,
    );
  });

  it("prefers an older running chat over the latest non-running chat in folded accordion header", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.chats = state.chats.map((chat) =>
      chat.chatId === "chat_5"
        ? {
            ...chat,
            hasActiveRun: true,
          }
        : chat,
    );
    mockState(state);

    const html = renderSidebar();

    expect(html).toMatch(
      /<div class="worker-panel-preview"><span>Latest reply 5<\/span><span class="material-icon [^"]*\bworker-chat-loading\b[^"]*\btw:animate-ui-spin\b[^"]*" data-material-icon="progress_activity">/,
    );
    expect(html).not.toMatch(
      /<span>Latest reply 6<\/span><span class="material-icon [^"]*\bworker-chat-loading\b/,
    );
  });

  it("keeps the latest chat preview when no worker chat is running", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    mockState(state);

    const html = renderSidebar();

    expect(html).toContain(
      '<div class="worker-panel-preview"><span>Latest reply 6</span></div>',
    );
    // header 不应该有 loading 图标（chat item 行始终有，但 CSS 控制显隐）
    expect(html).not.toMatch(
      /<div class="worker-panel-preview"><span>Latest reply 6<\/span><span class="material-icon [^"]*\bworker-chat-loading\b/,
    );
  });

  it("shows running status in folded accordion header from a local streaming session", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.chatId = "chat_5";
    mockState(state, {
      querySessions: new Map([
        [
          "req_1",
          {
            chatId: "chat_5",
            streaming: true,
          },
        ],
      ]),
    });

    const html = renderSidebar();

    expect(html).toMatch(
      /<div class="worker-panel-preview"><span>Latest reply 5<\/span><span class="material-icon [^"]*\bworker-chat-loading\b[^"]*\btw:animate-ui-spin\b[^"]*" data-material-icon="progress_activity">/,
    );
    expect(html).toMatch(
      /class="[^"]*\bworker-chat-action\b[^"]*" data-action="loading"/,
    );
    expect(html).toContain("worker-chat-action tw:relative tw:inline-flex tw:min-h-4 tw:flex-[0_0_30px]");
    expect(html).toContain("worker-chat-loading tw:absolute tw:right-[5px]");
    expect(html).toMatch(
      /class="chat-actions-trigger [^"]*\btw:hidden\b[^"]*"/,
    );
    expect(html).toContain("tw:absolute tw:right-[5px] tw:top-1/2 tw:-translate-y-1/2");
    expect(html).not.toContain("tw:!hidden");
    expect(html).toMatch(
      /class="ui-list-item is-selected [^"]*\bworker-chat-item\b[^"]*\bis-active\b[^"]*"/,
    );
    expect(html).toContain("worker-chat-item-head tw:flex tw:w-full tw:items-center tw:gap-1.5");
    expect(html).not.toContain("worker-chat-item:hover_");
    const workerStyles = fs.readFileSync(
      path.join(process.cwd(), "src", "shared", "styles", "globals", "workers.css"),
      "utf8",
    );
    expect(workerStyles).toMatch(
      /\.worker-chat-item:hover,[\s\S]*?\.worker-chat-item\.is-selected\s*\{[\s\S]*?background-color:\s*transparent;[\s\S]*?color:\s*var\(--text-main\);/,
    );
    expect(workerStyles).toMatch(
      /\[data-action\]\s+\.worker-chat-loading\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?transform:\s*translateY\(-50%\);[\s\S]*?display:\s*none;/,
    );
    expect(workerStyles).toMatch(
      /\[data-action\]\s+\.chat-actions-trigger\s*\{[\s\S]*?display:\s*none;/,
    );
    expect(workerStyles).not.toMatch(
      /\[data-action\]\s+\.chat-actions-trigger,\s*\n\[data-action\]\s+\.worker-chat-loading/,
    );
    expect(workerStyles).toMatch(
      /\.worker-chat-item:hover\s+\[data-action\]:not\(\[data-action="loading"\]\):not\(\[data-action="awaiting"\]\)\s+\.chat-actions-trigger\s*\{[\s\S]*?display:\s*unset;/,
    );
  });

  it("renders awaiting status across worker header and preview rows", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.chats[state.chats.length - 1].hasPendingAwaiting = true;
    state.chats[0].hasPendingAwaiting = true;
    mockState(state);

    const html = renderSidebar();

    expect(html).toContain(
      '<div class="worker-panel-preview"><span>Latest reply 1</span><span class="chat-awaiting-status tw:mr-[5px] tw:whitespace-nowrap tw:rounded-pill tw:bg-[color-mix(in_srgb,var(--accent-warn)_10%,transparent)] tw:px-1.5 tw:py-0.5 tw:text-[11px] tw:text-accent-warn">等待审批</span><span class="material-icon worker-chat-loading tw:mr-0.5 tw:text-base tw:text-text-sub tw:animate-ui-spin" data-material-icon="progress_activity">',
    );
    expect(html).toMatch(
      /<span class="[^"]*\bworker-chat-name\b[^"]*">Latest reply 1<\/span><span class="[^"]*\bworker-chat-action\b[^"]*" data-action="awaiting"><span class="[^"]*\bchat-awaiting-status\b[^"]*">等待审批<\/span><span class="material-icon [^"]*\bworker-chat-loading\b[^"]*" data-material-icon="progress_activity">/,
    );
    expect(html).toMatch(
      /data-action="awaiting"[\s\S]*class="chat-actions-trigger [^"]*\btw:hidden\b[^"]*"/,
    );
    expect(html).toContain("worker-chat-action");
  });

  it("renders awaiting status text based on awaiting mode", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    const targetChat = state.chats[state.chats.length - 1];
    targetChat.hasPendingAwaiting = true;
    targetChat.awaiting = { mode: "approval" };
    mockState(state);

    const html = renderSidebar();

    expect(html).toMatch(
      /<span class="[^"]*\bchat-awaiting-status\b[^"]*">等待批准<\/span>/,
    );
  });

  it("renders awaiting status as question text when mode is question", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    const targetChat = state.chats[state.chats.length - 1];
    targetChat.hasPendingAwaiting = true;
    targetChat.awaiting = { mode: "question" };
    mockState(state);

    const html = renderSidebar();

    expect(html).toMatch(
      /<span class="[^"]*\bchat-awaiting-status\b[^"]*">等待回答<\/span>/,
    );
  });
});
