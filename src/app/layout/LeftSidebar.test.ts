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
} from "@/features/workers/hooks/useWorkerSidebarData";
import type { AppState } from "@/app/state/AppContext";
import type { Chat } from "@/features/chats/lib/chatState";
import type { WorkerRow } from "@/features/workers/lib/workerState";
import { I18nProvider } from "@/shared/i18n";

const antdButtonProps: Array<Record<string, unknown>> = [];
const antdCollapseProps: Array<Record<string, unknown>> = [];
const uiButtonProps: Array<Record<string, unknown> & { text: string }> = [];
const dropdownMenuProps: Array<Record<string, unknown>> = [];
const mockModalConfirm = jest.fn();
const mockMessageSuccess = jest.fn();
const mockNavigate = jest.fn();
const mockOpenCommandOverlay = jest.fn();
const mockOpenMemory = jest.fn();
const WORKER_CHAT_BASE_UPDATED_AT = 1_710_000_000_000;

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

function readOwnedStyle(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), "src", ...segments), "utf8")
    .replace(/:global\(([^)]+)\)/g, "$1");
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
    onClick: (event: any) => menu.onClick?.({ key: item.key, domEvent: event })
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
    "data-checkbox-disabled": disabled ? "true" : "false"
      },
      React.createElement("input", {
        type: "checkbox",
        checked,
        disabled,
        onChange,
    ...props
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
    "data-radio-disabled": disabled ? "true" : "false"
      },
      React.createElement("input", {
        type: "radio",
        value,
        checked,
        disabled,
        onChange,
    ...props
      }),
      children,
    );
  Radio.Group = ({ children, value, defaultValue, disabled, onChange }: any) =>
    React.createElement(
      "div",
      {
        "data-radio-group-value": value ?? defaultValue,
    "data-radio-group-disabled": disabled ? "true" : "false"
      },
      React.Children.map(children, (child: any) =>
        React.isValidElement(child)
          ? React.cloneElement(child, {
              checked: child.props.value === (value ?? defaultValue),
              disabled: disabled || child.props.disabled,
    onChange
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
    style
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

  const Badge = ({ children, className, count, dot }: any) =>
    React.createElement(
      "span",
      {
        className,
        "data-badge-count": count,
    "data-badge-dot": dot ? "true" : "false"
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
    App: { useApp: () => ({ modal: jest.requireMock("antd").Modal }) },
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
        error: jest.fn()
    },
    Typography: {
        Text: ({ children }: any) => React.createElement("span", null, children)
    }
  };
});

jest.mock("antd/es/app/useApp", () => ({
  __esModule: true,
  default: () => ({
    message: {
      error: jest.fn(),
            success: jest.fn()
        }
    })
}));

jest.mock("@/shared/ui/UiButton", () => {
  const React = require("react");
  return {
    UiButton: React.forwardRef(({ children, className = "", iconOnly, loading, ...props }: any, ref: any) => {
        uiButtonProps.push({ ...props, className, text: collectText(children) });
        return React.createElement("button", {
            ref,
            type: props.type || "button",
            className,
            disabled: props.disabled || loading,
            ...props
        }, children);
    })
  };
});

jest.mock("@/app/state/AppContext", () => {
  const actual = jest.requireActual("@/app/state/AppContext");
  return {
    ...actual,
    useAppContext: jest.fn()
  };
});

jest.mock("@/features/memory/components/MemoryOverlayProvider", () => ({
    useMemoryOverlayActions: () => ({ openMemory: mockOpenMemory })
}));

jest.mock("@/features/command-center/components/CommandOverlayProvider", () => ({
  useCommandOverlayActions: () => ({
    openCommandOverlay: mockOpenCommandOverlay,
    patchCommandOverlay: jest.fn(),
        closeCommandOverlay: jest.fn()
    })
}));

jest.mock("@/shared/icons/agent", () => ({
    AgentIcon: () => React.createElement("span", null, "agent-icon")
}));

jest.mock("@/shared/data/desktop/desktopFileSystem", () => ({
  selectProjectFolder: jest.fn(),
    openRegisteredAgentDirectory: jest.fn()
}));

jest.mock("@/shared/data", () => ({
  createAgent: jest.fn(),
  deleteAgent: jest.fn(),
  getAgent: jest.fn(),
  getAgents: jest.fn(),
  getChats: jest.fn(),
  markChatRead: jest.fn(),
  searchGlobal: jest.fn(),
    updateAgentName: jest.fn()
}));

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
    useNavigate: () => mockNavigate
}));

const { useAppContext } = jest.requireMock("@/app/state/AppContext") as {
  useAppContext: jest.Mock;
};
const {
  selectProjectFolder,
  openRegisteredAgentDirectory,
} = jest.requireMock("@/shared/data/desktop/desktopFileSystem") as {
  selectProjectFolder: jest.Mock;
  openRegisteredAgentDirectory: jest.Mock;
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
      agentConfigDir: "/agents/agent_a",
      workspaceDir: "/work/alpha",
      latestChatId: "chat_6",
      latestRunId: "run_6",
      latestUpdatedAt: WORKER_CHAT_BASE_UPDATED_AT + 6000,
      latestChatName: "Chat 6",
      latestRunContent: "Latest reply 6",
      hasHistory: true,
      latestRunSortValue: 6000,
    searchText: "alpha agent worker_a"
    };

    const chats: Chat[] = Array.from({ length: 6 }, (_, index) => {
      const count = index + 1;
      return {
        chatId: `chat_${count}`,
        chatName: `Chat ${count}`,
        updatedAt: WORKER_CHAT_BASE_UPDATED_AT + count * 1000,
        agentKey: "worker_a",
        firstAgentKey: "worker_a",
        lastRunId: `run_${count}`,
        lastRunContent: `Latest reply ${count}`,
        read: {
        isRead: count % 2 === 0
    }
      };
    });

    return {
      ...state,
      leftDrawerOpen: false,
      workerSelectionKey: workerRow.key,
      workerRows: [workerRow],
      workerIndexByKey: new Map([[workerRow.key, workerRow]]),
      chats,
      agents: [
        {
          key: "worker_a",
          name: "Alpha Agent",
          workspaceDir: "/work/alpha",
          stats: {
                unreadCount: 3
          },
          icon: {
            name: "smart_toy",
                color: "#123456"
            }
          },
    ]
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
    activeQuerySessionRequestIdRef: { current: "" }
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


  it("shows unified pins once and retains five unpinned owner previews", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.chatPinnedOrder = ["chat_6"];
    state.chats = state.chats.map(chat => ({ ...chat, pinned: chat.chatId === "chat_6" }));
    mockState(state);
    const html = renderSidebar();
    const pinSection = html.split('<section class="pinned-chat-section"')[1].split('</section>')[0];
    const workerSection = html.slice(html.indexOf('</section>') + 10);
    expect(pinSection).toContain("Chat 6");
    expect(workerSection).not.toContain("Chat 6");
    for (let i = 1; i <= 5; i += 1) expect(workerSection).toContain(`Chat ${i}`);
    expect((workerSection.match(/class="[^"]*worker-chat-item /g) || []).length).toBe(5);
  });

  beforeEach(() => {
    antdButtonProps.length = 0;
    antdCollapseProps.length = 0;
    uiButtonProps.length = 0;
    dropdownMenuProps.length = 0;
    selectProjectFolder.mockReset();
    openRegisteredAgentDirectory.mockReset();
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
    removeItem: jest.fn()
    };
    globalWithWindow.window = {
      dispatchEvent: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      open: jest.fn(),
      location: {
        pathname: "/",
        search: ""
    }
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
    themeMode: "dark"
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

  it("renders compact theme summary on the settings trigger when enabled by env", () => {
    globalWithStorage.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
    SETTINGS_MENU_ENABLED: "true"
    };

    const html = renderSidebar();

    expect(html).toContain('id="settings-btn"');
    expect(html).toContain("打开设置菜单");
    expect(html).not.toContain(">夜<");
    expect(html).not.toContain(">日<");
    expect(html).toContain('data-material-icon="dark_mode"');
    expect(html).toContain("aria-haspopup=\"menu\"");
    expect(html).toContain("settings-summary-chip");
    expect(html).toContain("icon-btn ui-icon-hover-24");
    expect(html).toMatch(
      /class="[^\"]*\bui-icon-hover-24-target\b[^\"]*" data-material-icon="settings"/,
    );
  });

  it("opens registry config in a new page from the settings menu", () => {
    globalWithStorage.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
    SETTINGS_MENU_ENABLED: "true"
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

  it("opens Connectors in a new page and preserves the current search string", () => {
    globalWithStorage.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
    SETTINGS_MENU_ENABLED: "true"
    };
    globalWithWindow.window!.location.search = "?lang=zh-CN";

    renderSidebar();

    const mcpServersButton = uiButtonProps.find((props) =>
      props.text.includes("连接器"),
    );
    expect(mcpServersButton).toBeTruthy();

    (mcpServersButton?.onClick as () => void)();

    expect(globalWithWindow.window?.open).toHaveBeenCalledWith(
      "/connectors?lang=zh-CN",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("opens skills in a new page from the settings menu and preserves the current search string", () => {
    globalWithStorage.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
    SETTINGS_MENU_ENABLED: "true"
    };
    globalWithWindow.window!.location.search = "?lang=zh-CN";

    renderSidebar();

    const skillsButton = uiButtonProps.find((props) =>
      props.text.includes("技能中心"),
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
    SETTINGS_MENU_ENABLED: "true"
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
    SETTINGS_MENU_ENABLED: "true"
    };
    globalWithWindow.window!.location.search = "?lang=zh-CN";

    renderSidebar();

    const archiveButton = uiButtonProps.find((props) =>
      props.text.includes("已归档对话"),
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
    MEMORY_ENABLED: "true"
    };

    const html = renderSidebar();

    expect(html).toContain("自动化");
    expect(html).toContain("知识库");
    expect(html).not.toContain("智能体");
    expect(html).toContain("新建对话");
    expect(html).toContain("记忆");
    expect(html).not.toContain('data-badge-count="6"');
    expect(html).toContain('data-material-icon="edit_square"');
    expect(html).not.toContain('data-material-icon="robot_2"');
    for (const name of ["schedule", "database", "psychology"]) {
      const icon = html.match(new RegExp(`<span[^>]*data-material-icon="${name}"[^>]*>`))?.[0];
      expect(icon).toBeDefined();
      expect(icon).not.toContain("ui-icon-hover-24-target");
      expect(icon).toContain("tw:text-[16px]");
    }
    expect(html).not.toContain('placeholder="按 名称 / key / teamId 过滤');
    expect(html.indexOf('aria-label="对话排序"')).toBeLessThan(html.indexOf('aria-label="新建对话"'));

  });

  it("opens the memory overlay from the quick action", () => {
    globalWithStorage.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { QUICK_ACTIONS_ENABLED: "true" };
    renderSidebar();
    const button = uiButtonProps.find((props) => props.text === "记忆");
    expect(button).toBeTruthy();
    (button?.onClick as () => void)();
    expect(mockOpenMemory).toHaveBeenCalled();
  });

  it("opens the agent console from Settings", () => {
    globalWithStorage.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      QUICK_ACTIONS_ENABLED: "true",
    SETTINGS_MENU_ENABLED: "true"
    };
    const dispatch = jest.fn();
    const state = createInitialState();
    useAppContext.mockReturnValue({
      state: {
        ...state,
        leftDrawerOpen: true,
        agents: Array.from({ length: 20 }, (_, index) => ({
          key: `agent_${index}`,
            name: `Agent ${index}`
        }))
      },
      dispatch,
      stateRef: { current: state },
      querySessionsRef: { current: new Map() },
      chatQuerySessionIndexRef: { current: new Map() },
    activeQuerySessionRequestIdRef: { current: "" }
    });

    renderSidebar();

    const agentsButton = uiButtonProps.find((props) => props.text.includes("智能体"));
    expect(agentsButton).toBeTruthy();
    expect(typeof agentsButton?.onClick).toBe("function");

    (agentsButton?.onClick as () => void)();

    expect(globalWithWindow.window?.open).toHaveBeenCalledWith("/agents", "_blank", "noopener,noreferrer");
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
    searchText: "alpha"
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
    searchText: "beta"
    };
    const ops: WorkerRow = {
      ...alpha,
    key: "agent:ops",
    type: "agent",
      sourceId: "ops",
      displayName: "Ops",
      latestChatId: "chat_ops",
      latestRunId: "run_ops",
      latestUpdatedAt: 200,
      latestChatName: "Ops chat",
    searchText: "ops"
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
    searchText: "empty"
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
    updatedAt: 1760000000000
      } as Chat,
      {
        chatId: "chat_ops",
    agentKey: "ops",
    updatedAt: 1761000000000
      } as Chat,
      {
        chatId: "chat_beta",
        agentKey: "beta",
    updatedAt: 1762000000000
      } as Chat,
    ]);

    expect(
      sortWorkerRowsForMode(rows, {
        agentOrderByKey,
        workerBaseOrderByKey,
        workerChatOrderByKey,
    workerSortMode: "byTime"
      }).map((row) => row.key),
    ).toEqual(["agent:beta", "agent:ops", "agent:alpha", "agent:empty"]);
    expect(
      sortWorkerRowsForMode(rows, {
        agentOrderByKey,
        workerBaseOrderByKey,
        workerChatOrderByKey,
    workerSortMode: "byName"
      }).map((row) => row.key),
    ).toEqual(["agent:alpha", "agent:beta", "agent:empty", "agent:ops"]);
  });

  it("uses chatId to break updatedAt ties and keeps invalid timestamps oldest", () => {
    const orderByKey = createWorkerChatOrderByKey([
      { chatId: "chat_z", agentKey: "z", updatedAt: 1761000000000 } as Chat,
      { chatId: "chat_a", agentKey: "ops", updatedAt: 1761000000000 } as Chat,
      { chatId: "chat_invalid", agentKey: "invalid", updatedAt: "invalid" } as Chat,
    ]);

    expect([...orderByKey.keys()]).toEqual([
      "agent:ops",
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
    searchText: "alpha"
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
    searchText: "beta"
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
    searchText: "gamma"
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
    workerSortMode: "byTime"
      }).map((row) => row.key),
    ).toEqual(["agent:alpha", "agent:beta", "agent:gamma"]);
    expect(
      sortWorkerRowsForMode(rows, {
        agentOrderByKey,
        temporaryPinnedAgentKey: "alpha",
        workerBaseOrderByKey,
        workerChatOrderByKey,
    workerSortMode: "byName"
      }).map((row) => row.key),
    ).toEqual(["agent:alpha", "agent:gamma", "agent:beta"]);
    expect(
      sortWorkerRowsForMode(rows, {
        agentOrderByKey,
        temporaryPinnedAgentKey: "missing",
        workerBaseOrderByKey,
        workerChatOrderByKey,
    workerSortMode: "byTime"
      }).map((row) => row.key),
    ).toEqual(["agent:beta", "agent:gamma", "agent:alpha"]);
  });

  it("builds a coder project create request from workspace metadata", () => {
    expect(
      buildCoderAgentCreateRequest("/Users/demo/Project/agent-coder", {
    name: "agent-coder"
      }),
    ).toEqual({
      isProject: true,
      definition: {
        name: "agent-coder",
        mode: "CODER",
        runtimeConfig: {
            workspaceRoot: "/Users/demo/Project/agent-coder"
        }
    }
    });
    const acpRequest = buildCoderAgentCreateRequest(
      "/Users/demo/Project/acp-coder",
      {
        name: "ACP Coder",
    acpBridgeId: "proxy-acp-codex"
      },
    );
    expect(acpRequest).toEqual({
      isProject: true,
      definition: {
        name: "ACP Coder",
        mode: "CODER",
        engine: "acp",
        runtimeConfig: {
          workspaceRoot: "/Users/demo/Project/acp-coder",
            acpBridgeId: "proxy-acp-codex"
        }
    }
    });
    expect(JSON.stringify(acpRequest)).not.toContain("coderBackend");
  });

  it("builds a minimal kbase project create request", () => {
    const result = buildKbaseAgentCreateRequest(
      "/Users/demo/Knowledge/my-project",
      { name: "My KB" },
    );
    expect(result).toEqual({
      isProject: true,
      createLibrary: { name: "My KB", sourcePath: "/Users/demo/Knowledge/my-project" },
      definition: {
        name: "My KB",
        mode: "KBASE",
        runtimeConfig: {
            workspaceRoot: "/Users/demo/Knowledge/my-project"
        }
    }
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
        leftDrawerOpen: true
      },
      dispatch,
      stateRef: { current: state },
      querySessionsRef: { current: new Map() },
      chatQuerySessionIndexRef: { current: new Map() },
    activeQuerySessionRequestIdRef: { current: "" }
    });

    const html = renderSidebar();

    expect(html).toContain('aria-label="新建项目"');
    const button = uiButtonProps.find((props) => props["aria-label"] === "新建项目");
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
    workspaceDir: "/Users/demo/Project/browser-coder"
    };
    createAgent.mockResolvedValue({ data: createdAgent });
    getAgents.mockResolvedValue({ data: [createdAgent] });
    useAppContext.mockReturnValue({
      state: {
        ...state,
        leftDrawerOpen: true
      },
      dispatch,
      stateRef: { current: state },
      querySessionsRef: { current: new Map() },
      chatQuerySessionIndexRef: { current: new Map() },
    activeQuerySessionRequestIdRef: { current: "" }
    });

    renderSidebar();

    const button = uiButtonProps.find((props) => props["aria-label"] === "新建项目");
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
      scope: "nav",
      hasWorkspace: false,
    chatsPinned: false
    });
    expect(getAgents).toHaveBeenCalledWith({ includeChats: 5, scope: undefined, hasWorkspace: true, chatsPinned: false });

    // dispatch 了临时置顶
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_TEMPORARY_PINNED_AGENT_KEY",
    agentKey: createdKey
    });

    // dispatch 了 SET_AGENTS
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_AGENTS",
    agents: agentsData
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
    expect(html).toContain('aria-label="Alpha Agent"');
    expect(html).toContain(
      "worker-collapsed-name-badge tw:min-w-0 tw:max-w-[48px] tw:text-center",
    );
    const collapsedNameClass =
      html.match(/class="(worker-collapsed-name [^"]*)"/)?.[1] || "";
    expect(collapsedNameClass).toContain("tw:inline-block");
    expect(collapsedNameClass).toContain("tw:max-w-full");
    expect(collapsedNameClass).toContain("tw:overflow-hidden");
    expect(collapsedNameClass).toContain("tw:text-ellipsis");
    expect(collapsedNameClass).toContain("tw:whitespace-nowrap");
    expect(collapsedNameClass).toContain("tw:text-left");
    expect(collapsedNameClass).not.toContain("tw:w-full");
    expect(collapsedNameClass).not.toContain("tw:text-center");
    expect(html).toContain("worker-popover-header");
    expect(html).toContain("worker-popover-new");
    expect(html).not.toContain("ui-icon-hover-20");
    expect(html).toContain("worker-panel-new worker-popover-new");
    expect(html).toContain("worker-popover-new tw:!inline-flex tw:!h-6 tw:!w-6 tw:text-text-muted ui-icon-hover-24");
    expect(html).toContain("查看更多");
    expect(html).toContain("显示历史");
    const moreClass = html.match(/class="([^"]*\bworker-chat-more\b[^"]*)"/)?.[1] || "";
    expect(moreClass).toContain("tw:text-[12px]");
    expect(moreClass).not.toContain("tw:text-xs");
    expect(html).toMatch(
      /class="[^"]*\bworker-chat-more\b(?![^"tw:]*hover:text-text-main)[^"]*"/,
    );
    const workerStyles = readOwnedStyle(
      "features", "workers", "components", "WorkerNavigator.module.css",
    );
    expect(workerStyles).toMatch(
      /\.worker-chat-more:hover\s*\{[\s\S]*?color:\s*var\(--text-main\);/,
    );
  });

  it("keeps a long mixed worker name intact for CSS prefix truncation", () => {
    const state = createWorkerState();
    const displayName = "配置 DBX 数据库 HTTPXAssistantLong";
    state.workerRows[0].displayName = displayName;
    state.agents[0].name = displayName;
    mockState(state);

    const html = renderSidebar();

    expect(html).toContain(`aria-label="${displayName}"`);
    expect(html).toContain(`>${displayName}</span>`);
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
    openRegisteredAgentDirectory.mockResolvedValue(true);
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
    domEvent: { stopPropagation: jest.fn() }
    });
    await Promise.resolve();

    expect(openRegisteredAgentDirectory).toHaveBeenCalledWith({
      agentKey: "worker_a",
      directoryType: "workspace",
    desktopPath: "/Users/demo/Project/agent-coder"
    });
  });

  it("opens a dedicated KBASE workspace without a frontend workspaceDir", async () => {
    const state = createWorkerState();
    state.leftDrawerOpen = false;
    state.workerRows[0].agentType = "kbase";
    state.workerRows[0].workspaceDir = undefined;
    state.agents[0].mode = "KBASE";
    state.agents[0].workspaceDir = undefined;
    openRegisteredAgentDirectory.mockResolvedValue(true);
    mockState(state);

    renderSidebar();
    const menu = dropdownMenuProps.find((props) =>
      Array.isArray(props.items) &&
      props.items.some((item: any) => item?.key === "openWorkspace" && item?.disabled === false),
    ) as { onClick?: (event: { key: string; domEvent: { stopPropagation: jest.Mock } }) => void } | undefined;

    menu?.onClick?.({
      key: "openWorkspace",
    domEvent: { stopPropagation: jest.fn() }
    });
    await Promise.resolve();

    expect(openRegisteredAgentDirectory).toHaveBeenCalledWith({
      agentKey: "worker_a",
    directoryType: "workspace"
    });
  });

  it("renders and opens a worker config directory action when agentConfigDir is available", async () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.workerRows[0].agentConfigDir = "/agents/worker_a";
    mockState(state);
    openRegisteredAgentDirectory.mockResolvedValue(true);

    const html = renderSidebar();

    expect(html).toContain("打开配置目录");
    const menu = dropdownMenuProps.find((props) =>
      Array.isArray(props.items) &&
      props.items.some((item: any) => item?.key === "openConfigDirectory"),
    ) as { onClick?: (event: { key: string; domEvent: { stopPropagation: jest.Mock } }) => void } | undefined;
    expect(menu?.onClick).toBeTruthy();

    menu?.onClick?.({
      key: "openConfigDirectory",
    domEvent: { stopPropagation: jest.fn() }
    });
    await Promise.resolve();

    expect(openRegisteredAgentDirectory).toHaveBeenCalledWith({
      agentKey: "worker_a",
      directoryType: "config",
    desktopPath: "/agents/worker_a"
    });
  });

  it("disables the config directory action and skips the bridge when agentConfigDir is missing", async () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.workerRows[0].agentConfigDir = undefined;
    mockState(state);

    renderSidebar();

    const menu = dropdownMenuProps.find((props) =>
      Array.isArray(props.items) &&
      props.items.some((item: any) => item?.key === "openConfigDirectory"),
    ) as { items?: Array<{ key?: string; disabled?: boolean }> } | undefined;

    expect(menu?.items?.find((item) => item.key === "openConfigDirectory")?.disabled).toBe(true);

    const targetMenu = menu as
      | { onClick?: (event: { key: string; domEvent: { stopPropagation: jest.Mock } }) => void }
      | undefined;
    targetMenu?.onClick?.({
      key: "openConfigDirectory",
    domEvent: { stopPropagation: jest.fn() }
    });
    await Promise.resolve();

    expect(openRegisteredAgentDirectory).not.toHaveBeenCalled();
  });

  it("hides the config directory action for non-agent workers", () => {
    const state = createInitialState();
    state.leftDrawerOpen = true;
    const teamRow = {
    key: "agent:team_ops",
    type: "agent" as const,
      sourceId: "team_ops",
      displayName: "Ops",
      role: "Operations",
      teamAgentLabels: [],
      latestChatId: "",
      latestRunId: "",
      latestUpdatedAt: 0,
      latestChatName: "",
      latestRunContent: "",
      hasHistory: false,
      latestRunSortValue: -1,
    searchText: "ops team_ops"
    } as WorkerRow;
    state.teams = [
      {
    agentKey: "team_ops",
        name: "Ops",
    role: "Operations"
      },
    ];
    state.workerRows = [teamRow];
    state.workerIndexByKey = new Map([[teamRow.key, teamRow]]);
    mockState(state);

    renderSidebar();

    const menu = dropdownMenuProps.find((props) =>
      Array.isArray(props.items) &&
      props.items.some((item: any) => item?.key === "openWorkspace"),
    );
    expect(menu?.items?.some((item: any) => item?.key === "openConfigDirectory")).toBeFalsy();
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
      "openConfigDirectory",
      "renameAgent",
      "editAgent",
      "copyAgent",
    ]);
    expect(html).toContain("修改名称");
    expect(html).toContain("编辑智能体");
    expect(html).toContain("智能体信息");
    expect(html).toContain("打开配置目录");
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
      "openConfigDirectory",
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

    expect(expandedMenus).toHaveLength(2);
    expandedMenus.forEach((menu) => {
      expect(menu.items.map((item: any) => item.key)).toEqual([
        "openWorkspace",
        "openConfigDirectory",
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
      "openConfigDirectory",
      "renameAgent",
      "editAgent",
      "copyAgent",
      "deleteAgent",
    ]);

    const stopPropagation = jest.fn();
    collapsedMenus[0].onClick({
      key: "copyAgent",
    domEvent: { stopPropagation }
    });

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(getAgent).toHaveBeenCalledWith("worker_a");
  });

  it("opens the agent editor in a new page with the current search string", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.workerRows[0].sourceId = "worker/a";
    state.agents[0].key = "worker/a";
    globalWithWindow.window!.location.search = "?lang=zh-CN";
    mockState(state);

    renderSidebar();
    const menu = firstWorkerActionMenu();

    menu?.onClick?.({
      key: "editAgent",
    domEvent: { stopPropagation: jest.fn() }
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
    domEvent: { stopPropagation: jest.fn() }
    });

    expect(mockModalConfirm).toHaveBeenCalledTimes(1);
    const confirmConfig = mockModalConfirm.mock.calls[0][0];
    const modalStyles = readOwnedStyle(
      "features", "command-center", "components", "CommandSurface.module.css",
    );
    expect(confirmConfig.content.props.className).toBe("left-sidebar-rename-agent-input");
    expect(modalStyles).toMatch(
      /\.left-sidebar-rename-agent-input\.ant-input\s*\{[\s\S]*?border:\s*1px solid var\(--line-soft\)\s*!important;/,
    );
    expect(modalStyles).toMatch(
      /\.left-sidebar-rename-agent-input\.ant-input:focus\s*\{[\s\S]*?border-color:\s*var\(--accent-electric\)\s*!important;/,
    );
    confirmConfig.content.props.onChange({
    target: { value: "Beta Agent" }
    });
    await confirmConfig.onOk();

    expect(getAgent).not.toHaveBeenCalled();
    expect(updateAgentName).toHaveBeenCalledWith({
      key: "worker_a",
    name: "Beta Agent"
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
    domEvent: { stopPropagation: jest.fn() }
    });

    const confirmConfig = mockModalConfirm.mock.calls[0][0];
    confirmConfig.content.props.onChange({
    target: { value: "Beta Agent" }
    });
    await confirmConfig.onOk();

    expect(getAgent).not.toHaveBeenCalled();
    expect(updateAgentName).toHaveBeenCalledWith({
      key: "worker_a",
    name: "Beta Agent"
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
    domEvent: { stopPropagation: jest.fn() }
    });

    expect(mockModalConfirm).toHaveBeenCalledTimes(1);
    const confirmConfig = mockModalConfirm.mock.calls[0][0];
    await confirmConfig.onOk();

    expect(deleteAgent).toHaveBeenCalledWith({ key: "worker_a" });
    expect(globalWithWindow.window?.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "agent:refresh-worker-data" }),
    );
  });

  it("keeps project headers compact without worker role subtitles", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.workerRows[0].agentType = "agent";
    state.workerRows[0].role = "Operations assistant";
    mockState(state);

    const html = renderSidebar();

    expect(html).not.toContain("worker-panel-role");
    expect(html).not.toContain("Operations assistant");
  });

  it("shows browser folder coder workspace names without enabling local open", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = false;
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
    unreadCount: 3
    };
    mockState(state);

    const html = renderSidebar();

    expect(html).toContain("查看更多");
    expect(html).toContain("显示历史");
  });

  it("renders unread badges for worker rows", () => {
    mockState(createWorkerState());

    const workerHtml = renderSidebar();
    expect(workerHtml).toContain('data-badge-dot="true"');
    expect(workerHtml).toMatch(/chat-unread-dot[^"]*\bis-unread\b[^"]*\btw:opacity-100\b/);
  });

  it("selects a general agent for a new conversation", () => {
    const state = createWorkerState();
    state.leftDrawerOpen = true;
    state.agents[0].workspaceDir = undefined;
    state.workerRows[0].workspaceDir = undefined;
    mockState(state);
    renderSidebar();
    const picker = dropdownMenuProps.find(menu => Array.isArray(menu.items) && menu.items.some((item: any) => item.key === "agent:worker_a"));
    (picker?.onClick as any)({ key: "agent:worker_a" });
    expect(dispatchedEvents("agent:select-worker")[0].detail).toEqual({ workerKey: "agent:worker_a", focusComposerOnComplete: true, preferNewChat: true });
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
    focusComposerOnComplete: true
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
        isRead: false
    }
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
    focusComposerOnComplete: true
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
        isRead: true
    }
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
    focusComposerOnComplete: true
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
        isRead: true
    }
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
    focusComposerOnComplete: true
    });
    expect(dispatchedEvents("agent:start-new-conversation")).toHaveLength(0);
  });

  it("marks conversations created by automation", () => {
    const state = createWorkerState(); state.leftDrawerOpen = true;
    state.chats[state.chats.length - 1].source = "automation:daily";
    mockState(state);
    expect(renderSidebar()).toContain('title="自动化创建"');
  });

  it("uses chat preview content when the title is absent", () => {
    const state = createWorkerState(); state.leftDrawerOpen = true;
    state.chats[state.chats.length - 1].chatName = "";
    mockState(state);
    expect(renderSidebar()).toContain("Latest reply 6");
  });

  it("shows running state from a local streaming session without reserving an action column", () => {
    const state = createWorkerState(); state.leftDrawerOpen = true; state.chatId = "chat_5";
    mockState(state, { querySessions: new Map([["req_1", { chatId: "chat_5", streaming: true }]]) });
    const html = renderSidebar();
    expect(html).toContain('data-material-icon="progress_activity"');
    expect(html).not.toContain("tw:flex-[0_0_44px]");
    expect(html).toContain('aria-current="page"');
  });

  it.each([["approval", "等待批准"], ["question", "等待回答"], ["planning", "等待实施"]])("keeps %s awaiting status on the conversation row", (mode, label) => {
    const state = createWorkerState(); state.leftDrawerOpen = true;
    state.chats[state.chats.length - 1].hasPendingAwaiting = true;
    state.chats[state.chats.length - 1].awaiting = { mode };
    mockState(state);
    expect(renderSidebar()).toContain(label);
  });
});
