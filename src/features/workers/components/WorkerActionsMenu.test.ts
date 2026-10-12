import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MenuProps } from "antd";
import type { WorkerConversationRow, WorkerRow } from "@/features/workers/lib/workerState";
import { WorkerPanelHeader } from "./WorkerPanelHeader";
import { WorkerConversationPreviewList } from "./WorkerConversationPreviewList";

let mockMenu: MenuProps;
const mockTooltipTitles: string[] = [];
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/shared/icons/agent", () => ({ AgentIcon: () => null }));
jest.mock("../hooks/useSidebarChatPreviews", () => ({ useSidebarChatPreviews: () => ({ limits: {}, pending: {}, errors: {}, moreAvailable: {}, showMore: jest.fn(), retry: jest.fn() }) }));
jest.mock("antd", () => {
  const React = require("react");
  const Container = ({ children }: any) => React.createElement("div", null, children);
  return {
    Badge: () => null,
    Flex: Container,
    Button: Container,
    Typography: { Text: Container },
    Dropdown: ({ menu, children }: any) => {
      mockMenu = menu;
      return React.createElement("div", null, children);
    },
    Tooltip: ({ title, children }: any) => {
      mockTooltipTitles.push(title);
      return React.createElement("div", null, children);
    }
  };
});

describe("Worker panel preview status", () => {
  const chat: WorkerConversationRow = {
    chatId: "chat_1", chatName: "Current chat", agentKey: "alpha",
    updatedAt: 1, lastRunId: "run_1", lastRunContent: "", hasActiveRun: true,
  };
  const renderStatus = (awaitingMode?: string) => renderToStaticMarkup(React.createElement(WorkerPanelHeader, {
    row: { ...row, hasHistory: true }, isActive: false,
    activeRunChat: chat,
    awaitingChat: awaitingMode ? { ...chat, hasPendingAwaiting: true, awaitingMode } : undefined,
    onStartNewConversation: jest.fn(),
  }));

  it.each(["question", "approval", "planning", "form"])("shows only the %s awaiting label while the Run stays active", mode => {
    const html = renderStatus(mode);
    expect(html).toContain("chat-awaiting-status");
    expect(html).not.toContain('data-material-icon="progress_activity"');
  });

  it("keeps the spinner for an active Run without awaiting", () => {
    const html = renderStatus();
    expect(html).toContain('data-material-icon="progress_activity"');
    expect(html).not.toContain('class="chat-awaiting-status ');
  });
});

const row: WorkerRow = {
  key: "agent:alpha", type: "agent", sourceId: "alpha", displayName: "Alpha",
  agentType: "coder", workspaceDir: "/work/alpha", agentConfigDir: "/config/alpha",
  role: "", teamAgentLabels: [], latestChatId: "", latestRunId: "",
  latestUpdatedAt: 0, latestChatName: "", latestRunContent: "",
    hasHistory: false, latestRunSortValue: 0, searchText: ""
};
const handlers = {
  onOpenProject: jest.fn(), onOpenWorkspace: jest.fn(), onOpenConfigDirectory: jest.fn(),
  onRenameAgent: jest.fn(), onEditAgent: jest.fn(),
    onCopyAgent: jest.fn(), onDeleteAgent: jest.fn()
};

describe.each(["panel", "popover"] as const)("Worker actions in %s", (entry) => {
  const renderMenu = (overrides: Partial<WorkerRow> = {}, actions = handlers) => {
    const props = { row: { ...row, ...overrides }, ...actions, onStartNewConversation: jest.fn() };
    return renderToStaticMarkup(entry === "panel"
      ? React.createElement(WorkerPanelHeader, { ...props, isActive: false })
      : React.createElement(WorkerConversationPreviewList, {
          ...props, chats: [], activeChatId: "", showHeader: true,
    getWorkerChatLoading: () => false, onSelectChat: jest.fn(), onOpenHistory: jest.fn()
        }));
  };
  const items = () => mockMenu.items as Array<{ key: string; disabled?: boolean; danger?: boolean; className?: string }>;
  const click = (key: string) => {
    const stopPropagation = jest.fn();
    mockMenu.onClick?.({ key, domEvent: { stopPropagation } } as any);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockTooltipTitles.length = 0;
  });

  it("keeps menu order, danger styling, and every worker/agent action argument", () => {
    renderMenu();
    expect(items().map((item) => item.key)).toEqual([
      "openProject", "openWorkspace", "openConfigDirectory", "renameAgent", "editAgent", "copyAgent", "deleteAgent",
    ]);
    expect(items().every((item) => item.className === "ui-icon-hover-24")).toBe(true);
    expect(items().filter((item) => item.danger).map((item) => item.key)).toEqual(["deleteAgent"]);
    items().forEach(({ key }) => click(key));
    expect(handlers.onOpenProject).toHaveBeenCalledWith("alpha");
    expect(handlers.onOpenWorkspace).toHaveBeenCalledWith("agent:alpha");
    expect(handlers.onOpenConfigDirectory).toHaveBeenCalledWith("agent:alpha");
    expect(handlers.onRenameAgent).toHaveBeenCalledWith("agent:alpha", "alpha", "Alpha");
    expect(handlers.onEditAgent).toHaveBeenCalledWith("alpha");
    expect(handlers.onCopyAgent).toHaveBeenCalledWith("agent:alpha", "alpha");
    expect(handlers.onDeleteAgent).toHaveBeenCalledWith("agent:alpha", "alpha");
  });

  it("uses ordinary Agent management actions for TEAM rows", () => {
    renderMenu({ type: "agent", key: "agent:one", sourceId: "one" });
    expect(items().map((item) => item.key)).toEqual(["openProject", "openWorkspace", "openConfigDirectory", "renameAgent", "editAgent", "copyAgent", "deleteAgent"]);
    click("openWorkspace");
    expect(handlers.onOpenWorkspace).toHaveBeenCalledWith("agent:one");
    renderMenu({ agentType: "agent" });
    expect(items().map((item) => item.key)).not.toContain("deleteAgent");
  });

  it.each([undefined, "", "   "])("hides project editor without a workspace (%s)", workspaceDir => {
    renderMenu({ workspaceDir });
    expect(items().map(item => item.key)).not.toContain("openProject");
    click("openProject");
    expect(handlers.onOpenProject).not.toHaveBeenCalled();
  });

  it("opens a project for ordinary Agents with a workspace", () => {
    renderMenu({ agentType: "agent", sourceId: "other-project" });
    expect(items().map(item => item.key)).toContain("openProject");
    click("openProject");
    expect(handlers.onOpenProject).toHaveBeenCalledWith("other-project");
  });

  it("keeps unavailable browser directories visible but disabled", () => {
    renderMenu({ workspaceDir: undefined, agentConfigDir: undefined, workspaceSourceKind: "browser-folder" });
    expect(items().slice(0, 2).map((item) => item.disabled)).toEqual([true, true]);
    expect(mockTooltipTitles).toContain("leftSidebar.browserWorkspaceOpenUnavailable");
    click("openWorkspace");
    click("openConfigDirectory");
    expect(handlers.onOpenWorkspace).not.toHaveBeenCalled();
    expect(handlers.onOpenConfigDirectory).not.toHaveBeenCalled();
  });

  it("allows kbase workspace without a path and keeps absent directory handlers visible", () => {
    renderMenu({ agentType: "kbase", workspaceDir: undefined });
    expect(items()[0].disabled).toBe(false);
    expect(items().map((item) => item.key)).toContain("deleteAgent");
    click("openWorkspace");
    expect(handlers.onOpenWorkspace).toHaveBeenCalledWith(row.key);
    renderMenu({}, {} as typeof handlers);
    expect(items().map((item) => item.key)).toEqual(["openWorkspace", "openConfigDirectory"]);
  });
});
