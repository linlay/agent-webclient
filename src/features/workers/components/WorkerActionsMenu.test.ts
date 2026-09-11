import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MenuProps } from "antd";
import type { WorkerRow } from "@/features/workers/lib/workerState";
import { WorkerPanelHeader } from "./WorkerPanelHeader";
import { WorkerConversationPreviewList } from "./WorkerConversationPreviewList";

let mockMenu: MenuProps;
const mockTooltipTitles: string[] = [];
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/shared/icons/agent", () => ({ AgentIcon: () => null }));
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
    },
  };
});

const row: WorkerRow = {
  key: "agent:alpha", type: "agent", sourceId: "alpha", displayName: "Alpha",
  agentType: "coder", workspaceDir: "/work/alpha", agentConfigDir: "/config/alpha",
  role: "", teamAgentLabels: [], latestChatId: "", latestRunId: "",
  latestUpdatedAt: 0, latestChatName: "", latestRunContent: "",
  hasHistory: false, latestRunSortValue: 0, searchText: "",
};
const handlers = {
  onOpenWorkspace: jest.fn(), onOpenConfigDirectory: jest.fn(),
  onRenameAgent: jest.fn(), onEditAgent: jest.fn(),
  onCopyAgent: jest.fn(), onDeleteAgent: jest.fn(),
};

describe.each(["panel", "popover"] as const)("Worker actions in %s", (entry) => {
  const renderMenu = (overrides: Partial<WorkerRow> = {}, actions = handlers) => {
    const props = { row: { ...row, ...overrides }, ...actions, onStartNewConversation: jest.fn() };
    return renderToStaticMarkup(entry === "panel"
      ? React.createElement(WorkerPanelHeader, { ...props, isActive: false })
      : React.createElement(WorkerConversationPreviewList, {
          ...props, chats: [], activeChatId: "", showHeader: true,
          getWorkerChatLoading: () => false, onSelectChat: jest.fn(), onOpenHistory: jest.fn(),
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
      "openWorkspace", "openConfigDirectory", "renameAgent", "editAgent", "copyAgent", "deleteAgent",
    ]);
    expect(items().every((item) => item.className === "ui-icon-hover-24")).toBe(true);
    expect(items().filter((item) => item.danger).map((item) => item.key)).toEqual(["deleteAgent"]);
    items().forEach(({ key }) => click(key));
    expect(handlers.onOpenWorkspace).toHaveBeenCalledWith("agent:alpha");
    expect(handlers.onOpenConfigDirectory).toHaveBeenCalledWith("agent:alpha");
    expect(handlers.onRenameAgent).toHaveBeenCalledWith("agent:alpha", "alpha", "Alpha");
    expect(handlers.onEditAgent).toHaveBeenCalledWith("alpha");
    expect(handlers.onCopyAgent).toHaveBeenCalledWith("agent:alpha", "alpha");
    expect(handlers.onDeleteAgent).toHaveBeenCalledWith("agent:alpha", "alpha");
  });

  it("keeps teams scoped to workspace and ordinary agents without delete", () => {
    renderMenu({ type: "team", key: "team:one", sourceId: "one" });
    expect(items().map((item) => item.key)).toEqual(["openWorkspace"]);
    click("openWorkspace");
    expect(handlers.onOpenWorkspace).toHaveBeenCalledWith("team:one");
    renderMenu({ agentType: "agent" });
    expect(items().map((item) => item.key)).not.toContain("deleteAgent");
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
