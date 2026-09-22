/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Agent } from "@/features/agents/lib/agentState";
import { AgentListPane, type AgentListPaneProps } from "./AgentListPane";

jest.mock("antd", () => {
  const React = require("react");
  return {
    Divider: () => null,
    Flex: ({ children }: { children?: unknown }) =>
      React.createElement("div", null, children),
    Input: () => React.createElement("input"),
    Popover: ({ children }: { children?: unknown }) =>
      React.createElement("div", { "data-popover": "true" }, children),
    Spin: ({ children }: { children?: unknown }) => children || null,
    Tag: ({ children }: { children?: unknown }) =>
      React.createElement("span", null, children),
    Tooltip: ({ children }: { children?: unknown }) => children,
  };
});
jest.mock("@/shared/ui/CreateMenuButton", () => ({
  CreateMenuButton: () => null,
}));
// 拖拽行为不属于本用例关注点，直接透传子树，避免 dnd-kit 的 SSR 警告
jest.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children?: unknown }) => children,
  closestCenter: () => [],
  KeyboardSensor: function KeyboardSensor() {},
  PointerSensor: function PointerSensor() {},
  useSensor: () => ({}),
  useSensors: (...sensors: unknown[]) => sensors,
}));
jest.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children?: unknown }) => children,
  sortableKeyboardCoordinates: () => null,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setActivatorNodeRef: () => {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
  }),
  verticalListSortingStrategy: () => null,
}));
jest.mock("@/shared/ui/MaterialIcon", () => ({ MaterialIcon: () => null }));
jest.mock("@/shared/icons/agent", () => ({ AgentIcon: () => null }));
jest.mock("@/shared/ui/UiButton", () => ({ UiButton: () => null }));

const AGENTS: Agent[] = [
  { key: "agent-a", name: "Agent A" },
  { key: "agent-b", name: "Agent B" },
];

function buildProps(selectedAgentKey: string): AgentListPaneProps {
  return {
    agents: AGENTS,
    selectedAgentKey,
    draggingAgentKey: "",
    loading: false,
    savingOrder: false,
    searchText: "",
    t: (key: string) => key,
    getSummary: () => ({
      mode: "REACT",
      modelKey: "model-x",
      toolsCount: 1,
      skillsCount: 2,
    }),
    getDiagnostic: () => "",
    isInvalid: () => false,
    onSearchTextChange: () => {},
    onRefresh: () => {},
    onCreate: () => {},
    onSelect: () => {},
    onDraggingAgentKeyChange: () => {},
    onMove: () => {},
    onEditConversation: () => {},
    onDelete: () => {},
  };
}

function renderList(selectedAgentKey: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    React.createElement(AgentListPane, buildProps(selectedAgentKey)),
  );
  return container;
}

test("列表渲染出全部智能体列表项", () => {
  const container = renderList("agent-a");
  expect(container.querySelectorAll(".agent-console-list-item").length).toBe(2);
  expect(
    container.querySelectorAll(".agent-console-list-item.is-active").length,
  ).toBe(1);
});

test("当前选中的智能体不渲染悬浮摘要，未选中项仍保留", () => {
  const container = renderList("agent-a");
  const active = container.querySelector(".agent-console-list-item.is-active");
  expect(active).not.toBeNull();
  expect(active?.closest("[data-popover]")).toBeNull();

  const idle = Array.from(
    container.querySelectorAll(".agent-console-list-item"),
  ).filter((item) => !item.classList.contains("is-active"));
  expect(idle.length).toBe(1);
  expect(idle[0].closest("[data-popover]")).not.toBeNull();
});

test("切换选中项后由新的选中项接管该行为", () => {
  const container = renderList("agent-b");
  const active = container.querySelector(".agent-console-list-item.is-active");
  expect(active?.closest("[data-popover]")).toBeNull();
  expect(container.querySelectorAll("[data-popover]").length).toBe(1);
});
