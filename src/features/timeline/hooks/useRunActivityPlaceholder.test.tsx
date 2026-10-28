/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  RUN_ACTIVITY_PLACEHOLDER_INTERVAL_MS,
  RUN_ACTIVITY_PLACEHOLDER_KEYS,
  useRunActivityPlaceholder,
} from "./useRunActivityPlaceholder";
import { zhCNMessages } from "@/shared/i18n/locales/zh-CN";
import { I18nProvider } from "@/shared/i18n";

const message = (index: number) =>
  zhCNMessages[RUN_ACTIVITY_PLACEHOLDER_KEYS[index]];

let root: Root;
let container: HTMLDivElement;
let text: string | null;
let active = true;
let scopeKey = "chat-a/run-a";
let randomSpy: jest.SpyInstance<number, []>;

function Harness() {
  text = useRunActivityPlaceholder({ active, scopeKey });
  return null;
}

function render(nextActive = active, nextScopeKey = scopeKey) {
  active = nextActive;
  scopeKey = nextScopeKey;
  act(() => root.render(
    <I18nProvider locale="zh-CN" persistLocale={false}>
      <Harness />
    </I18nProvider>,
  ));
}

function advance(ms: number) {
  act(() => jest.advanceTimersByTime(ms));
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  jest.useFakeTimers();
  randomSpy = jest.spyOn(Math, "random").mockReturnValue(0);
  active = true;
  scopeKey = "chat-a/run-a";
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  expect(jest.getTimerCount()).toBe(0);
  randomSpy.mockRestore();
  jest.useRealTimers();
});

it("cycles through the configured sentences while the run is active", () => {
  render();
  expect(text).toBe(message(0));
  expect(jest.getTimerCount()).toBe(1);

  advance(RUN_ACTIVITY_PLACEHOLDER_INTERVAL_MS);
  expect(text).toBe(message(1));

  advance(RUN_ACTIVITY_PLACEHOLDER_INTERVAL_MS);
  expect(text).toBe(message(2));

  advance(
    RUN_ACTIVITY_PLACEHOLDER_INTERVAL_MS *
      (RUN_ACTIVITY_PLACEHOLDER_KEYS.length - 2),
  );
  expect(text).toBe(message(0));
});

it("uses the full thirty-label pool and prefixes every Chinese label", () => {
  expect(RUN_ACTIVITY_PLACEHOLDER_KEYS).toHaveLength(30);
  for (const key of RUN_ACTIVITY_PLACEHOLDER_KEYS) {
    expect(zhCNMessages[key]).toMatch(/^正在/);
  }
});

it("starts from a random entry on initialization", () => {
  randomSpy.mockReturnValue(0.5);
  render();
  expect(text).toBe(message(15));
  expect(jest.getTimerCount()).toBe(1);
});

it("renders nothing and keeps no timer when no run is active", () => {
  render(false);
  expect(text).toBeNull();
  expect(jest.getTimerCount()).toBe(0);

  advance(RUN_ACTIVITY_PLACEHOLDER_INTERVAL_MS * 2);
  expect(text).toBeNull();
});

it("picks a new random entry when the chat or run scope changes", () => {
  render();
  advance(RUN_ACTIVITY_PLACEHOLDER_INTERVAL_MS);
  expect(text).toBe(message(1));

  randomSpy.mockReturnValue(0.9);
  render(true, "chat-b/run-b");
  expect(text).toBe(message(27));

  advance(RUN_ACTIVITY_PLACEHOLDER_INTERVAL_MS);
  expect(text).toBe(message(28));
});

it("picks a new random entry when an inactive run becomes active again", () => {
  render();
  advance(RUN_ACTIVITY_PLACEHOLDER_INTERVAL_MS);
  expect(text).toBe(message(1));

  render(false);
  expect(text).toBeNull();
  expect(jest.getTimerCount()).toBe(0);

  randomSpy.mockReturnValue(0.2);
  render(true);
  expect(text).toBe(message(6));
  expect(jest.getTimerCount()).toBe(1);

  advance(RUN_ACTIVITY_PLACEHOLDER_INTERVAL_MS);
  expect(text).toBe(message(7));
});
