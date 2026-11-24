/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ArchiveListPane } from "@/features/archive/components/ArchiveListPane";
import type { ArchivedSummaryResponse } from "@/shared/data";
import { t } from "@/shared/i18n";

jest.mock("antd", () => ({
  Input: (props: {
    prefix?: React.ReactNode;
    suffix?: React.ReactNode;
    value?: string;
    placeholder?: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  }) =>
    require("react").createElement(
      "div",
      { "data-testid": "archive-search-input" },
      props.prefix,
      require("react").createElement("input", {
        "aria-label": "archive-search",
        value: props.value,
        placeholder: props.placeholder,
        onChange: props.onChange,
      }),
      props.suffix,
    ),
  Select: (props: {
    value?: string;
    options?: Array<{ value: string; label?: React.ReactNode }>;
    placeholder?: string;
    onChange?: (value: string) => void;
    "aria-label"?: string;
  }) =>
    require("react").createElement(
      "select",
      {
        "data-testid": "agent-filter-select",
        "aria-label": props["aria-label"],
        value: props.value ?? "",
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
          props.onChange?.(event.target.value),
      },
      require("react").createElement(
        "option",
        { value: "" },
        props.placeholder ?? "",
      ),
      (props.options ?? []).map((option) =>
        require("react").createElement(
          "option",
          { key: option.value, value: option.value },
          option.value,
        ),
      ),
    ),
  Dropdown: ({
    children,
    menu,
    trigger,
  }: {
    children: React.ReactNode;
    trigger?: string[];
    menu?: {
      items?: Array<{ key?: string; label?: React.ReactNode; type?: string }>;
      onClick?: (info: { key: string; domEvent?: any }) => void;
    };
  }) => {
    const react = require("react");
    const isContext = Array.isArray(trigger) && trigger.includes("contextMenu");
    const items = (menu?.items ?? []).filter((item) => item.type !== "divider");
    return react.createElement(
      react.Fragment,
      null,
      children,
      isContext
        ? react.createElement("span", { "data-testid": "context-menu" })
        : react.createElement(
            "div",
            { "data-testid": "dropdown-menu" },
            items.map((item) =>
              react.createElement(
                "button",
                {
                  key: String(item.key),
                  type: "button",
                  "data-menu-key": item.key,
                  onClick: (event: any) =>
                    menu?.onClick?.({ key: String(item.key), domEvent: event }),
                },
                item.label,
              ),
            ),
          ),
    );
  },
  Spin: ({ children }: { children: React.ReactNode }) => children,
  Tooltip: ({
    title,
    children,
  }: {
    title?: React.ReactNode;
    children: React.ReactNode;
  }) =>
    require("react").createElement(
      "span",
      { "data-tooltip-title": title },
      children,
    ),
  DatePicker: () => null,
  Popover: ({
    children,
    content,
  }: {
    children: React.ReactNode;
    content?: React.ReactNode;
  }) =>
    require("react").createElement(
      require("react").Fragment,
      null,
      children,
      content,
    ),
}));

jest.mock("@/shared/icons/agent", () => ({
  AgentIcon: (props: { props?: { avatar?: { size?: number } } }) =>
    require("react").createElement("span", {
      "data-testid": "agent-icon",
      "data-size": props.props?.avatar?.size,
    }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const summary = (
  chatId: string,
  agentKey?: string,
): ArchivedSummaryResponse => ({
  chatId,
  chatName: `Chat ${chatId}`,
  agentKey,
  createdAt: 0,
  updatedAt: 0,
  lastRunAt: 0,
  archivedAt: 0,
});

const baseProps: React.ComponentProps<typeof ArchiveListPane> = {
  query: "",
  onQueryChange: jest.fn(),
  agents: [
    { key: "agent_a", name: "Alpha", mode: "GENERAL" },
    { key: "agent_b", name: "Beta", mode: "GENERAL" },
  ],
  showAgentFilter: true,
  agentFilter: "",
  onAgentFilterChange: jest.fn(),
  archivedRange: null,
  onArchivedRangeChange: jest.fn(),
  createdRange: null,
  onCreatedRangeChange: jest.fn(),
  lastRunRange: null,
  onLastRunRangeChange: jest.fn(),
  filteredCount: 3,
  totalCount: 3,
  onResetFilters: jest.fn(),
  onRefresh: jest.fn(),
  resultText: "",
  loading: false,
  items: [
    summary("a1", "agent_a"),
    summary("a2", "agent_a"),
    summary("b1", "agent_b"),
  ],
  selectedChatId: "",
  onSelect: jest.fn(),
  canRestoreAndOpen: false,
  onRestore: jest.fn(),
  onDelete: jest.fn(),
  onRestoreGroup: jest.fn(),
  onDeleteGroup: jest.fn(),
};

async function renderPane(
  overrides: Partial<React.ComponentProps<typeof ArchiveListPane>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ArchiveListPane {...baseProps} {...overrides} />);
  });
  return { container, root };
}

function click(element: Element | null) {
  expect(element).not.toBeNull();
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

afterEach(() => {
  document.body.innerHTML = "";
  jest.clearAllMocks();
});

test("groups archived chats by agent and shows the chat count per group", async () => {
  const { container, root } = await renderPane();

  const groups = container.querySelectorAll(".archive-group");
  expect(groups).toHaveLength(2);
  expect(groups[0].textContent).toContain("Alpha");
  expect(groups[0].textContent).toContain("2 条");
  expect(groups[1].textContent).toContain("Beta");
  expect(groups[0].querySelectorAll('[role="option"]')).toHaveLength(2);
  // The owning agent is carried by the group header, not repeated per row.
  expect(groups[0].querySelector('[role="option"]')?.textContent).not.toContain(
    "agent_a",
  );

  await act(async () => root.unmount());
});

test("puts the filter trigger inside the search input and merges the agent picker into it", async () => {
  const { container, root } = await renderPane();

  const toolbar = container.querySelector(".archive-toolbar");
  const searchInput = toolbar?.querySelector(
    '[data-testid="archive-search-input"]',
  );
  expect(searchInput?.querySelector("input")).not.toBeNull();

  const filterTrigger = searchInput?.querySelector(
    `[aria-label="${t("archive.filter.ariaLabel")}"]`,
  );
  expect(filterTrigger).not.toBeNull();
  // The suffix entry is a single icon button, not the old labelled trigger.
  expect(filterTrigger?.tagName).toBe("BUTTON");
  expect(filterTrigger?.textContent?.trim()).toBe("");

  const popover = searchInput?.querySelector(".archive-filter-popover");
  const agentSelect = popover?.querySelector(
    `[aria-label="${t("archive.filter.agent")}"]`,
  ) as HTMLSelectElement | null;
  expect(agentSelect).not.toBeNull();
  if (!agentSelect) throw new Error("agent picker missing from filter popover");
  // "all agents" plus one row per agent.
  expect(agentSelect.options).toHaveLength(baseProps.agents.length + 1);

  const selectValue = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    selectValue?.call(agentSelect, "agent_b");
    agentSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(baseProps.onAgentFilterChange).toHaveBeenCalledWith("agent_b");

  await act(async () => root.unmount());
});

test("keeps the agent picker out of the filter popover for embedded panes", async () => {
  const { container, root } = await renderPane({ showAgentFilter: false });

  const popover = container.querySelector(".archive-filter-popover");
  expect(popover).not.toBeNull();
  expect(
    popover?.querySelector(`[aria-label="${t("archive.filter.agent")}"]`),
  ).toBeNull();

  await act(async () => root.unmount());
});

test("adds a refresh button next to the search input", async () => {
  const onRefresh = jest.fn();
  const { container, root } = await renderPane({ onRefresh });

  const refresh = container.querySelector(
    `.archive-toolbar [aria-label="${t("archive.action.refresh")}"]`,
  );
  expect(refresh).not.toBeNull();
  click(refresh);
  expect(onRefresh).toHaveBeenCalledTimes(1);

  await act(async () => root.unmount());
});

test("keeps the group header quiet and puts group actions in a dropdown", async () => {
  const { container, root } = await renderPane();

  const firstGroup = container.querySelectorAll(".archive-group")[0];
  const avatar = firstGroup
    .querySelector(".archive-group-identity")
    ?.querySelector('[data-testid="agent-icon"]');
  expect(avatar?.getAttribute("data-size")).toBe("18");

  const actions = firstGroup.querySelector(".archive-group-actions");
  expect(actions?.textContent).toContain("2 条");
  expect(
    actions?.querySelector(`[aria-label="${t("archive.group.more")}"]`),
  ).not.toBeNull();
  expect(actions?.querySelectorAll("[data-menu-key]")).toHaveLength(2);
  // Groups stay expanded; only the dropdown holds the bulk actions.
  expect(firstGroup.querySelector("[aria-expanded]")).toBeNull();
  expect(firstGroup.querySelectorAll('[role="option"]')).toHaveLength(2);

  click(actions?.querySelector('[data-menu-key="restoreAll"]') ?? null);
  expect(baseProps.onRestoreGroup).toHaveBeenCalledWith("agent_a");
  click(actions?.querySelector('[data-menu-key="deleteAll"]') ?? null);
  expect(baseProps.onDeleteGroup).toHaveBeenCalledWith("agent_a");

  await act(async () => root.unmount());
});

test("puts archived row actions into the shared hover more menu", async () => {
  const onRestore = jest.fn();
  const onDelete = jest.fn();
  const onSelect = jest.fn();
  const { container, root } = await renderPane({
    canRestoreAndOpen: true,
    onRestore,
    onDelete,
    onSelect,
  });

  const row = container.querySelector('[role="option"]');
  const more = row?.querySelector('button[aria-haspopup="menu"]');
  expect(more).not.toBeNull();
  // 每行同时注册右键菜单（与更多按钮共用同一份菜单项）
  expect(container.querySelectorAll('[data-testid="context-menu"]')).toHaveLength(
    container.querySelectorAll('[role="option"]').length,
  );
  // 不再平铺三个内联按钮，菜单承载恢复 / 还原并打开 / 删除
  const menuButtons = Array.from(row?.querySelectorAll("[data-menu-key]") ?? []);
  expect(menuButtons.map((button) => button.textContent)).toEqual([
    t("archive.action.restore"),
    t("archive.action.restoreAndOpen"),
    t("archive.action.delete"),
  ]);
  expect(row?.querySelector(".archive-list-item-actions")).toBeNull();

  click(more);
  expect(onRestore).not.toHaveBeenCalled();
  click(row?.querySelector('[data-menu-key="restore"]') ?? null);
  expect(onRestore).toHaveBeenCalledWith("a1", false);
  click(row?.querySelector('[data-menu-key="restoreAndOpen"]') ?? null);
  expect(onRestore).toHaveBeenCalledWith("a1", true);
  click(row?.querySelector('[data-menu-key="delete"]') ?? null);
  expect(onDelete).toHaveBeenCalledWith("a1");
  // Row actions must not also open the chat.
  expect(onSelect).not.toHaveBeenCalled();

  await act(async () => root.unmount());
});

test("omits restore-and-open from the row menu when unsupported", async () => {
  const { container, root } = await renderPane({ canRestoreAndOpen: false });

  const row = container.querySelector('[role="option"]');
  expect(row?.querySelector('[data-menu-key="restore"]')).not.toBeNull();
  expect(row?.querySelector('[data-menu-key="restoreAndOpen"]')).toBeNull();
  expect(row?.querySelector('[data-menu-key="delete"]')).not.toBeNull();

  await act(async () => root.unmount());
});

test("renders a centered empty state when there are no archived chats", async () => {
  const { container, root } = await renderPane({ items: [] });

  const empty = container.querySelector(".archive-empty-state");
  expect(empty).not.toBeNull();
  expect(empty?.querySelector(".archive-empty-state-icon")).not.toBeNull();
  expect(empty?.textContent).toContain(t("archive.empty.list"));
  expect(empty?.textContent).toContain(t("archive.empty.listHint"));

  await act(async () => root.unmount());
});

test("keeps the empty state blank while the first load is pending", async () => {
  const { container, root } = await renderPane({ items: [], loading: true });

  expect(container.querySelector(".archive-empty-state")).not.toBeNull();
  expect(container.textContent).not.toContain(t("archive.empty.list"));

  await act(async () => root.unmount());
});

test("shows only the last run timestamp on archive rows", async () => {
  const lastRunAt = new Date(2026, 8, 10, 16, 5).getTime();
  const { container, root } = await renderPane({
    items: [
      {
        ...summary("a1", "agent_a"),
        createdAt: new Date(2026, 8, 1, 9, 0).getTime(),
        lastRunAt,
        archivedAt: new Date(2026, 8, 12, 10, 30).getTime(),
      },
    ],
  });

  const row = container.querySelector('[role="option"]');
  expect(row?.textContent).toContain("2026-09-10 16:05");
  expect(row?.textContent).not.toContain(t("archive.item.lastRun"));
  expect(row?.textContent).not.toContain(t("archive.item.created"));
  expect(row?.textContent).not.toContain("归档于");

  await act(async () => root.unmount());
});

test("shows an unassigned group for archives without an agent key", async () => {
  const { container, root } = await renderPane({
    items: [summary("orphan_1")],
  });

  expect(container.textContent).toContain(t("archive.group.unknown"));
  expect(container.textContent).toContain("1 条");

  await act(async () => root.unmount());
});
