/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "@/shared/i18n";
import { CreateMenuButton } from "./CreateMenuButton";

it.each(["手工创建", "通过对话创建"])("opens the plus menu without creating, then dispatches only %s", async (choice) => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const manual = jest.fn();
  const conversation = jest.fn();
  try {
    await act(async () => root.render(React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false }, React.createElement(CreateMenuButton, { label: "新增", onManual: manual, onConversation: conversation }))));
    await act(async () => host.querySelector("button")!.click());
    expect(manual).not.toHaveBeenCalled();
    expect(conversation).not.toHaveBeenCalled();
    const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(items.map(item => item.textContent)).toEqual(["手工创建", "通过对话创建"]);
    await act(async () => items.find(item => item.textContent === choice)!.click());
    expect(manual).toHaveBeenCalledTimes(choice === "手工创建" ? 1 : 0);
    expect(conversation).toHaveBeenCalledTimes(choice === "通过对话创建" ? 1 : 0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
