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
    Dropdown: ({ children, trigger, disabled, menu }: any) =>
      React.createElement(
        "div",
        {
          "data-dropdown": "true",
          "data-trigger": (trigger || []).join(","),
          "data-disabled": disabled ? "true" : "false",
          "data-menu-items": menu
            ? JSON.stringify(
                (menu.items || []).map((item: any) => item.key || item.type),
              )
            : "",
        },
        children,
      ),
    Input: () => React.createElement("input"),
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
jest.mock("@/shared/ui/UiButton", () => ({
  UiButton: ({
    loading: _loading,
    iconOnly: _iconOnly,
    variant: _variant,
    size: _size,
    active: _active,
    color: _color,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) =>
    React.createElement("button", rest, children),
}));

const AGENTS: Agent[] = [
  { key: "agent-a", name: "Agent A" },
  { key: "agent-b", name: "Agent B" },
];

function buildProps(
  selectedAgentKey: string,
  overrides: Partial<AgentListPaneProps> = {},
): AgentListPaneProps {
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
    ...overrides,
  };
}

function renderList(
  selectedAgentKey: string,
  overrides: Partial<AgentListPaneProps> = {},
): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    React.createElement(AgentListPane, buildProps(selectedAgentKey, overrides)),
  );
  return container;
}

const contextMenus = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll('[data-dropdown][data-trigger="contextMenu"]'),
  );

test("列表渲染出全部智能体列表项", () => {
  const container = renderList("agent-a");
  expect(container.querySelectorAll(".agent-console-list-item").length).toBe(2);
  expect(
    container.querySelectorAll(".agent-console-list-item.is-active").length,
  ).toBe(1);
});

test("不再渲染悬浮摘要浮层，选中项与未选中项行为一致", () => {
  const container = renderList("agent-a");
  expect(container.querySelectorAll("[data-popover]").length).toBe(0);
  expect(
    container.querySelectorAll(".agent-console-list-item-wrap").length,
  ).toBe(2);
});

test("每个列表项右侧都提供更多操作按钮", () => {
  const container = renderList("agent-a");
  const wraps = Array.from(
    container.querySelectorAll(".agent-console-list-item-wrap"),
  );
  expect(wraps.length).toBe(2);
  for (const wrap of wraps) {
    const button = wrap.querySelector('button[aria-haspopup="menu"]');
    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-label")).toContain(
      "leftSidebar.moreActions",
    );
    // 操作菜单收进 item 右侧的悬浮按钮，不嵌在 item 内部
    expect(button?.closest(".agent-console-list-item")).toBeNull();
    // 按钮与右键菜单统一由共享 RowMoreMenu 提供
    expect(button?.closest('[data-trigger="click"]')).not.toBeNull();
  }
});

test("每个列表项同时注册右键菜单，并与更多按钮共用同一套菜单项", () => {
  const container = renderList("agent-a");
  const menus = contextMenus(container);
  expect(menus.length).toBe(2);
  for (const menu of menus) {
    expect(menu.getAttribute("data-disabled")).toBe("false");
    expect(menu.getAttribute("data-menu-items")).toBe(
      '["edit-conversation","divider","delete"]',
    );
    expect(menu.querySelector(".agent-console-list-item")).not.toBeNull();
  }
  const clickMenu = container.querySelector('[data-trigger="click"]');
  expect(clickMenu?.getAttribute("data-menu-items")).toBe(
    menus[0].getAttribute("data-menu-items"),
  );
});

test("没有可执行操作时不渲染更多按钮，也不触发 hover 淡出", () => {
  const container = renderList("agent-a", {
    onEditConversation: undefined,
    onDelete: undefined,
  });
  expect(
    container.querySelectorAll('button[aria-haspopup="menu"]').length,
  ).toBe(0);
  expect(
    container.querySelector("[data-has-actions]"),
  ).toBeNull();
  expect(contextMenus(container)[0].getAttribute("data-disabled")).toBe("true");
});

test("排序保存中禁用右键菜单与更多按钮", () => {
  const container = renderList("agent-a", { savingOrder: true });
  expect(contextMenus(container)[0].getAttribute("data-disabled")).toBe("true");
  expect(
    container
      .querySelector('button[aria-haspopup="menu"]')
      ?.hasAttribute("disabled"),
  ).toBe(true);
});
