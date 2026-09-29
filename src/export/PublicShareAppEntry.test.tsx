/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PublicShareAppEntry } from "./PublicShareAppEntry";
import type { PublicShareBrand } from "./publicShareBrand";

jest.mock("./brand-icons/zenmind.svg", () => "zenmind-icon");
jest.mock("./brand-icons/cutej.svg", () => "cutej-icon");
jest.mock("@/shared/icons/agent-icons/default.svg", () => "default-icon");

const brand: PublicShareBrand = {
  id: "zenmind",
  productName: "ZenMind",
  openUrl: "zenmind://open",
  downloadPageUrl: "https://example.test/download",
};

let host: HTMLDivElement;
let root: Root;

function setVisibility(value: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
}

function renderEntry(value: PublicShareBrand = brand): void {
  act(() => root.render(<PublicShareAppEntry brand={value} locale="zh-CN" />));
}

function clickAppEntry(): void {
  const entry = host.querySelector<HTMLAnchorElement>('a[href="zenmind://open"]')!;
  entry.addEventListener("click", (event) => event.preventDefault(), { capture: true, once: true });
  act(() => entry.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));
}

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

beforeEach(() => {
  jest.useFakeTimers();
  setVisibility("visible");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.style.overflow = "";
  jest.useRealTimers();
});

it("shows a stable opening prompt immediately without inferring launch failure", () => {
  renderEntry();
  clickAppEntry();

  const dialog = host.querySelector('[role="dialog"]');
  expect(dialog?.textContent).toContain("正在打开 ZenMind");
  expect(dialog?.textContent).toContain("若未安装，可点击「前往下载」。");
  const download = host.querySelector<HTMLAnchorElement>('a[href="https://example.test/download"]')!;
  expect(download.textContent).toBe("前往下载");
  expect(download.target).toBe("_blank");
  expect(download.rel).toBe("noopener noreferrer");

  act(() => jest.advanceTimersByTime(2_000));
  expect(host.querySelector('[role="dialog"]')?.textContent).toBe(dialog?.textContent);
});

it("keeps the prompt open when Chrome's external-app confirmation blurs the page", () => {
  renderEntry();
  clickAppEntry();
  act(() => window.dispatchEvent(new Event("blur")));
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain("正在打开 ZenMind");
});

it.each(["visibilitychange", "pagehide"])("closes the prompt when the page leaves through %s", (eventName) => {
  renderEntry();
  clickAppEntry();
  if (eventName === "visibilitychange") setVisibility("hidden");
  act(() => (eventName === "pagehide" ? window : document).dispatchEvent(new Event(eventName)));

  expect(host.querySelector('[role="dialog"]')).toBeNull();
  act(() => jest.advanceTimersByTime(2_000));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});

it("closes through Escape and after the explicit download action", () => {
  renderEntry();
  clickAppEntry();
  act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(host.querySelector('[role="dialog"]')).toBeNull();

  clickAppEntry();
  const download = host.querySelector<HTMLAnchorElement>('a[href="https://example.test/download"]')!;
  download.addEventListener("click", (event) => event.preventDefault(), { capture: true, once: true });
  act(() => download.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});

it("keeps the original direct app link behavior when no download page is configured", () => {
  renderEntry({ id: "zenmind", productName: "ZenMind", openUrl: "zenmind://open" });
  clickAppEntry();
  act(() => jest.advanceTimersByTime(2_000));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});
