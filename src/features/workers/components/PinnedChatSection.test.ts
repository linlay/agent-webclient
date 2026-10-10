/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Agent } from "@/features/agents/lib/agentState";
import type { Chat } from "@/features/chats/lib/chatState";
import { PinnedChatSection } from "./PinnedChatSection";

const mockState: {
  chats: Chat[];
  chatPinnedOrder: string[];
  chatFilter: string;
  chatId: string;
  agents: Agent[];
  teams: Agent[];
} = {
  chats: [],
  chatPinnedOrder: [],
  chatFilter: "",
  chatId: "",
    agents: []
};

jest.mock("@/app/state/AppContext", () => ({
    useAppContext: () => ({ state: mockState })
}));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/shared/ui/useAppMessage", () => ({
    useAppMessage: () => ({ error: jest.fn() })
}));
jest.mock("@/features/chats/hooks/useChatPinActions", () => ({
    useChatPinActions: () => ({ update: jest.fn(), pending: false })
}));
jest.mock("@/features/chats/components/ChatActionsMenu", () => ({
    ChatActionsMenu: ({ renderTrigger }: any) => renderTrigger?.(() => undefined) || null
}));
jest.mock("antd", () => {
  const React = require("react");
  const Container = ({ children }: { children?: unknown }) =>
    React.createElement("div", null, children);
  return { Badge: Container, Popover: Container };
});
jest.mock("antd/es", () => {
  const React = require("react");
  return {
    Avatar: ({ icon, ...props }: {
        icon?: unknown;
    }) => React.createElement("span", props, icon)
  };
});
jest.mock("@dnd-kit/core", () => ({
    DndContext: ({ children }: {
        children?: unknown;
    }) => children,
  closestCenter: () => [],
    KeyboardSensor: function KeyboardSensor() { },
    PointerSensor: function PointerSensor() { },
  useSensor: () => ({}),
    useSensors: (...sensors: unknown[]) => sensors
}));
jest.mock("@dnd-kit/sortable", () => ({
    SortableContext: ({ children }: {
        children?: unknown;
    }) => children,
  sortableKeyboardCoordinates: () => null,
  useSortable: () => ({
    attributes: {},
    listeners: {},
        setActivatorNodeRef: () => { },
        setNodeRef: () => { },
    transform: null,
        transition: undefined
  }),
    verticalListSortingStrategy: () => null
}));
jest.mock("@dnd-kit/utilities", () => ({
    CSS: { Transform: { toString: () => undefined } }
}));

function renderSection(): string {
  return renderToStaticMarkup(
    React.createElement(PinnedChatSection, {
      collapsed: false,
    onSelectChat: () => { },
    getChatLoading: () => false
    }),
  );
}

function seedPinned(chats: Chat[]): void {
  mockState.chats = chats;
  mockState.chatPinnedOrder = chats.map((chat) => chat.chatId);
}

beforeEach(() => {
  mockState.chatFilter = "";
  mockState.chatId = "";
  mockState.agents = [];
  mockState.teams = [];
  mockState.chats = [];
  mockState.chatPinnedOrder = [];
});

describe("Pinned chat owner identity", () => {
  it("renders the agent avatar before the agent name", () => {
    mockState.agents = [{ key: "agent-alpha", name: "Alpha", icon: { name: "coder" } }];
    seedPinned([
      { chatId: "chat-agent", chatName: "置顶会话", agentKey: "agent-alpha" },
    ]);

    const html = renderSection();

    expect(html).toContain("<img");
    expect(html).toContain('data-agent-icon-source="builtin"');
    expect(html).toContain('class="pinned-chat-owner-icon"');
    expect(html).toContain("width:12px");
    expect(html).toContain(">Alpha<");
    expect(html.indexOf("pinned-chat-owner-icon")).toBeLessThan(
      html.indexOf("pinned-chat-owner-label"),
    );
  });

  it("falls back to the default agent avatar when the agent has no icon", () => {
    mockState.agents = [{ key: "agent-alpha", name: "Alpha" }];
    seedPinned([
      { chatId: "chat-agent", chatName: "置顶会话", agentKey: "agent-alpha" },
    ]);

    const html = renderSection();

    expect(html).toContain('data-agent-icon-source="default"');
    expect(html).toContain(">Alpha<");
  });

  it("renders TEAM ownership from the Agent catalog", () => {
    mockState.agents = [{ key: "agent-alpha", name: "Alpha", icon: { name: "coder" } }];
    mockState.agents.push({ key: "team-one", mode: "TEAM", name: "团队一" });
    seedPinned([
      {
        chatId: "chat-team",
        chatName: "团队会话",
    agentKey: "team-one"
      },
    ]);

    const html = renderSection();

    expect(html).toContain(">团队一<");
    expect(html).toContain("pinned-chat-owner-icon");
  });

  it("omits the avatar when the agent is not present in the agent list", () => {
    seedPinned([
      {
        chatId: "chat-unknown",
        chatName: "未知智能体会话",
        agentKey: "agent-missing",
    firstAgentName: "历史智能体"
      },
    ]);

    const html = renderSection();

    expect(html).toContain(">历史智能体<");
    expect(html).not.toContain("pinned-chat-owner-icon");
  });

  it("falls back to the raw agentKey when the TEAM Agent is unknown", () => {
    seedPinned([{ chatId: "chat-team", chatName: "团队会话", agentKey: "team-missing" }]);

    const html = renderSection();

    expect(html).toContain(">team-missing<");
    expect(html).not.toContain("pinned-chat-owner-icon");
  });
});
