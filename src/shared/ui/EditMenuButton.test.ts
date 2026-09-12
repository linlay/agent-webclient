/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "@/shared/i18n";
import { EditMenuButton } from "./EditMenuButton";

it.each(["直接编辑", "通过对话编辑"])("opens the edit menu without editing, then dispatches only %s", async (choice) => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const manual = jest.fn();
  const conversation = jest.fn();
  try {
    await act(async () => root.render(React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false }, React.createElement(EditMenuButton, { label: "编辑智能体", onManual: manual, onConversation: conversation }))));
    await act(async () => host.querySelector("button")!.click());
    expect(manual).not.toHaveBeenCalled();
    expect(conversation).not.toHaveBeenCalled();
    const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(items.map(item => item.textContent)).toEqual(["直接编辑", "通过对话编辑"]);
    await act(async () => items.find(item => item.textContent === choice)!.click());
    expect(manual).toHaveBeenCalledTimes(choice === "直接编辑" ? 1 : 0);
    expect(conversation).toHaveBeenCalledTimes(choice === "通过对话编辑" ? 1 : 0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
