/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { GlobalSearchPanel } from "./GlobalSearchPanel";
import type { GlobalRow } from "../lib/globalSearchRows";

jest.mock("@/shared/icons/agent", () => ({ AgentIcon: () => null }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const rows: GlobalRow[] = [
  { kind: "action", section: "actions", key: "newConversation", action: "newConversation", label: "New chat", icon: "edit_square" },
  { kind: "action", section: "actions", key: "history", action: "history", label: "History", icon: "history" },
  { kind: "action", section: "actions", key: "settings", action: "settings", label: "Settings", icon: "settings" },
  { kind: "action", section: "actions", key: "debug", action: "debug", label: "Debug", icon: "bug_report" },
];

it.each(["MacIntel", "Win32"])("displays and activates matching palette shortcuts on %s", platform => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const platformSpy = jest.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const select = jest.fn();
  const mac = platform === "MacIntel";
  const render = (items = rows, active = true) => act(() => root.render(React.createElement(GlobalSearchPanel, {
    searchText: "", searchInputRef: React.createRef<HTMLInputElement>(), placeholder: "Search", emptyText: "Empty",
    active, rows: items, onSearchChange: jest.fn(), onSelectRow: select,
  })));
  const press = (code: string, overrides: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", { key: code === "Enter" ? "Enter" : code.slice(3).toLowerCase(), code,
      bubbles: true, cancelable: true, metaKey: mac, ctrlKey: !mac, ...overrides });
    act(() => host.querySelector("input")!.dispatchEvent(event));
    return event;
  };
  try {
    render();
    expect(host.querySelectorAll("kbd")).toHaveLength(2);
    expect(host.querySelector('[aria-keyshortcuts]')?.getAttribute("aria-keyshortcuts")).toBe(`${mac ? "Meta" : "Control"}+Enter`);
    for (const [index, code] of ["Enter", "KeyH"].entries()) {
      expect(press(code).defaultPrevented).toBe(true);
      expect(select).toHaveBeenLastCalledWith(rows[index]);
    }
    select.mockClear();
    expect(press("Comma").defaultPrevented).toBe(false);
    expect(press("KeyD").defaultPrevented).toBe(false);
    expect(select).not.toHaveBeenCalled();
    const outsideInput = document.createElement("input");
    document.body.append(outsideInput);
    outsideInput.focus();
    const outsideEvent = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true, metaKey: mac, ctrlKey: !mac });
    act(() => outsideInput.dispatchEvent(outsideEvent));
    expect(outsideEvent.defaultPrevented).toBe(true);
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith(rows[0]);
    outsideInput.remove();
    select.mockClear();
    const bodyEvent = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true, metaKey: mac, ctrlKey: !mac });
    act(() => document.body.dispatchEvent(bodyEvent));
    expect(bodyEvent.defaultPrevented).toBe(true);
    expect(select).toHaveBeenCalledTimes(1);
    select.mockClear();
    expect(press("KeyN").defaultPrevented).toBe(false);
    expect(select).not.toHaveBeenCalled();
    press("Enter", { repeat: true });
    press("Enter", { isComposing: true });
    press("Enter", { shiftKey: true });
    press("Enter", { altKey: true });
    press("Enter", { metaKey: !mac, ctrlKey: mac });
    expect(select).not.toHaveBeenCalled();
    render(rows.filter(row => row.key !== "newConversation"));
    expect(press("Enter").defaultPrevented).toBe(false);
    expect(select).not.toHaveBeenCalled();
    render(rows, false);
    expect(press("Enter").defaultPrevented).toBe(false);
    expect(select).not.toHaveBeenCalled();
    render(rows, true);
    expect(press("Enter").defaultPrevented).toBe(true);
    expect(select).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    host.remove();
    platformSpy.mockRestore();
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});
