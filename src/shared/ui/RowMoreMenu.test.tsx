/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { RowMoreMenu } from "./RowMoreMenu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("antd", () => {
  const React = require("react");
  return {
    Dropdown: ({ children, trigger, disabled, menu }: any) => {
      const isContext = (trigger || []).includes("contextMenu");
      const items = (menu?.items || []).filter(
        (item: any) => item && item.type !== "divider",
      );
      return React.createElement(
        "div",
        {
          "data-dropdown": "true",
          "data-trigger": (trigger || []).join(","),
          "data-disabled": disabled ? "true" : "false",
          "data-menu-items": JSON.stringify(items.map((item: any) => item.key)),
        },
        children,
        isContext
          ? null
          : items.map((item: any) =>
              React.createElement(
                "button",
                {
                  key: item.key,
                  type: "button",
                  "data-key": item.key,
                  onClick: (event: any) =>
                    menu.onClick?.({ key: item.key, domEvent: event }),
                },
                item.label,
              ),
            ),
      );
    },
  };
});

const ITEMS = [
  { key: "edit", label: "通过对话编辑" },
  { type: "divider" },
  { key: "delete", label: "删除", danger: true },
];

describe("RowMoreMenu", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function render(
    overrides: Partial<React.ComponentProps<typeof RowMoreMenu>> = {},
  ) {
    act(() =>
      root.render(
        <RowMoreMenu
          items={ITEMS}
          onSelect={() => {}}
          label="更多操作"
          {...overrides}
        >
          <button type="button">行内容</button>
        </RowMoreMenu>,
      ),
    );
    return host.querySelector<HTMLElement>('[data-trigger="contextMenu"] > div');
  }

  it("点击与右键共用同一份菜单，按钮位于行内", () => {
    const onSelect = jest.fn();
    const row = render({ onSelect });

    expect(row).not.toBeNull();
    const more = row!.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="menu"]',
    );
    expect(more).not.toBeNull();
    expect(more?.getAttribute("aria-label")).toBe("更多操作");
    expect(more?.getAttribute("title")).toBe("更多操作");

    const clickMenu = row!.querySelector('[data-trigger="click"]');
    const contextMenu = host.querySelector('[data-trigger="contextMenu"]');
    expect(clickMenu).not.toBeNull();
    expect(contextMenu).not.toBeNull();
    expect(clickMenu?.getAttribute("data-menu-items")).toBe(
      contextMenu?.getAttribute("data-menu-items"),
    );
    expect(clickMenu?.getAttribute("data-menu-items")).toBe(
      '["edit","delete"]',
    );

    act(() => {
      row!.querySelector<HTMLButtonElement>('[data-key="edit"]')!.click();
    });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ key: "edit" }),
    );
  });

  it("移动端接管菜单时只回调，不渲染 Dropdown", () => {
    const onMoreClick = jest.fn();
    const onRowClick = jest.fn();
    act(() =>
      root.render(
        <RowMoreMenu
          items={ITEMS}
          onSelect={() => {}}
          label="更多操作"
          onMoreClick={onMoreClick}
          rowProps={{ role: "option", onClick: onRowClick }}
        >
          <button type="button">行内容</button>
        </RowMoreMenu>,
      ),
    );
    expect(host.querySelector('[data-trigger="contextMenu"]')).toBeNull();
    const more = host.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="dialog"]',
    );
    expect(more).not.toBeNull();
    act(() => more!.click());
    expect(onMoreClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("把 role、tabIndex 与点击处理透传到行容器", () => {
    const onRowClick = jest.fn();
    const row = render({
      rowProps: { role: "option", tabIndex: 0, onClick: onRowClick },
    });

    expect(row?.getAttribute("role")).toBe("option");
    expect(row?.getAttribute("tabindex")).toBe("0");
    act(() => row!.click());
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("按钮的键盘事件不再冒泡到行容器", () => {
    const onRowKeyDown = jest.fn();
    const row = render({ rowProps: { onKeyDown: onRowKeyDown } });
    const more = row!.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="menu"]',
    )!;

    act(() => {
      more.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(onRowKeyDown).not.toHaveBeenCalled();
  });

  it("禁用时按钮与右键菜单同时不可用", () => {
    const row = render({ disabled: true });
    expect(
      row!.querySelector('button[aria-haspopup="menu"]')?.hasAttribute(
        "disabled",
      ),
    ).toBe(true);
    expect(
      host
        .querySelector('[data-trigger="contextMenu"]')
        ?.getAttribute("data-disabled"),
    ).toBe("true");
  });

  it("没有菜单项时不渲染按钮，也不标记可操作行", () => {
    const row = render({ items: [] });
    expect(row).not.toBeNull();
    expect(row!.hasAttribute("data-has-actions")).toBe(false);
    expect(row!.querySelector('button[aria-haspopup="menu"]')).toBeNull();
    expect(
      host
        .querySelector('[data-trigger="contextMenu"]')
        ?.getAttribute("data-disabled"),
    ).toBe("true");
  });
});
