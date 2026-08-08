import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GlobalRow } from "@/features/search/lib/globalSearchRows";
import { GlobalSearchPanel } from "@/features/search/components/GlobalSearchPanel";

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        "globalSearch.group.awaiting": "等待中",
        "globalSearch.group.unread": "未读聊天",
        "globalSearch.group.actions": "操作",
        "globalSearch.group.workers": "智能体",
        "globalSearch.group.history": "对话",
        "globalSearch.row.unread": "未读",
      })[key] || key,
  }),
}));

jest.mock("@/shared/icons/agent", () => {
  const ReactRuntime = require("react");
  return {
    AgentIcon: ({ type }: { type: string }) =>
      ReactRuntime.createElement("span", {
        className: "agent-icon-mock",
        "data-agent-type": type,
      }),
  };
});

jest.mock("@/shared/ui/MaterialIcon", () => {
  const ReactRuntime = require("react");
  return {
    MaterialIcon: ({ name, className }: { name: string; className?: string }) =>
      ReactRuntime.createElement("span", {
        className: `material-icon-mock ${className || ""}`.trim(),
        "data-icon-name": name,
      }),
  };
});

function renderPanel(rows: GlobalRow[]): string {
  return renderToStaticMarkup(
    React.createElement(GlobalSearchPanel, {
      searchText: "",
      searchInputRef: React.createRef<HTMLInputElement>(),
      placeholder: "Search",
      emptyText: "Empty",
      rows,
      onSearchChange: jest.fn(),
      onSelectRow: jest.fn(),
    }),
  );
}

describe("GlobalSearchPanel", () => {
  it("renders attention sections, source labels, actions, and workers", () => {
    const rows: GlobalRow[] = [
      {
        kind: "history",
        section: "awaiting",
        key: "awaiting:chat-awaiting",
        chatId: "chat-awaiting",
        label: "Awaiting title",
        snippet: "Awaiting preview",
        sourceLabel: "Alpha",
        updatedAt: 0,
        isUnread: false,
        hasPendingAwaiting: true,
        statusLabel: "等待回答",
        hasActiveRun: false,
      },
      {
        kind: "history",
        section: "unread",
        key: "unread:chat-unread",
        chatId: "chat-unread",
        label: "Unread title",
        snippet: "Unread preview",
        sourceLabel: "Beta",
        updatedAt: 0,
        isUnread: true,
        hasPendingAwaiting: false,
        hasActiveRun: false,
      },
      {
        kind: "action",
        section: "actions",
        key: "settings",
        label: "Settings",
        icon: "settings",
        action: "settings",
      },
      {
        kind: "worker",
        section: "workers",
        key: "agent:coder",
        label: "Coder",
        role: "Builder",
        type: "agent",
      },
    ];

    const html = renderPanel(rows);

    expect(html.indexOf("等待中")).toBeLessThan(html.indexOf("未读聊天"));
    expect(html.indexOf("未读聊天")).toBeLessThan(html.indexOf("操作"));
    expect(html.indexOf("操作")).toBeLessThan(html.indexOf("智能体"));
    expect(html).toContain("Awaiting title");
    expect(html).toContain("Awaiting preview");
    expect(html).toContain("等待回答");
    expect(html).toContain("Alpha");
    expect(html).toContain("Unread title");
    expect(html).toContain("global-search-unread-dot");
    expect(html).toContain("Beta");
    expect(html).toContain("data-icon-name=\"settings\"");
    expect(html).toContain("Coder");
    expect(html).toContain("Builder");
    expect(html).toContain("agent-icon-mock");
  });
});
