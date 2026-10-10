/** @jest-environment jsdom */
jest.mock("react-router-dom", () => ({ useLocation: () => ({ pathname: "/agent/agent", search: "?chatId=chat-a" }) }));
import { dispatchDesktopAwaitingDigit, DESKTOP_AWAITING_DIGIT_MESSAGE_TYPE } from "@/features/composer/hooks/useDesktopAwaitingDigit";
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { QuestionDialog } from "./index";
import { AwaitingShell } from "@/features/composer/components/AwaitingShell";
import { AIAwaitQuestionType } from "@/shared/contracts/agentEvents";
import type { QuestionActiveAwaiting } from "@/features/tools/lib/toolsState";

jest.mock("antd/es", () => jest.requireActual("antd"));
jest.mock("@/shared/i18n", () => ({ t: (key: string) => key, useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/shared/ui/useAppMessage", () => ({ useAppMessage: () => ({ warning: jest.fn(), info: jest.fn() }) }));
jest.mock("@/shared/ui/MaterialIcon", () => ({ MaterialIcon: () => null }));
jest.mock("@/features/tools/hooks/useAwaitingTimeoutCountdown", () => ({ useAwaitingTimeoutCountdown: () => ({ label: "" }) }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const data: QuestionActiveAwaiting = {
  key: "run:ask", runId: "run", awaitingId: "ask", agentKey: "agent", mode: "question", timeout: null,
  questions: [{ id: "choice", question: "Choose", type: AIAwaitQuestionType.MultiSelect,
    options: [{ label: "One" }, { label: "Two" }], allowFreeText: true }],
};
let host: HTMLDivElement, root: Root;
let submit: jest.Mock;
const render = async (next = data) => {
  await act(async () => root.render(<AwaitingShell><QuestionDialog data={next} onSubmit={submit} /></AwaitingShell>));
};
const settle = async () => { await act(async () => { jest.advanceTimersByTime(300); }); };
const option = (index = 0) => host.querySelector<HTMLElement>(`[data-index="${index}"]`)!;
const checkboxes = () => Array.from(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
const digit = async (key: string) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  await act(async () => { document.activeElement!.dispatchEvent(event); });
  return event;
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(document, "hasFocus").mockReturnValue(true);
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addListener() {}, removeListener() {} }) });
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  submit = jest.fn().mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks();
});

test("awaiting shell can receive focus and digits without selecting an answer on focus", async () => {
  await render(); await settle();
  const shell = host.querySelector<HTMLElement>(".composer-awaiting-shell")!;
  expect(shell.tabIndex).toBe(-1);
  shell.focus(); // jsdom does not perform the browser's mousedown default focus action.
  expect(document.activeElement).toBe(shell);
  expect(checkboxes().every((input) => !input.checked)).toBe(true);
  expect((await digit("2")).defaultPrevented).toBe(true);
  expect(checkboxes()[1].checked).toBe(true);
  expect(submit).not.toHaveBeenCalled();
});

test("a new awaiting at the same question index restores focus after the Pager delay", async () => {
  await render(); await settle();
  const shell = host.querySelector<HTMLElement>(".composer-awaiting-shell")!;
  shell.focus();
  const focus = jest.spyOn(HTMLElement.prototype, "focus");
  await render({ ...data, awaitingId: "next", key: "run:next" });
  expect(document.activeElement).toBe(shell);
  await settle();
  expect(document.activeElement).toBe(option());
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
});

test("changing runs with the same awaiting ID also restores focus", async () => {
  await render(); await settle();
  host.querySelector<HTMLElement>(".composer-awaiting-shell")!.focus();
  await render({ ...data, runId: "next-run", key: "next-run:ask" }); await settle();
  expect(document.activeElement).toBe(option());
});

test("delayed autofocus preserves an input the user has already focused", async () => {
  await render();
  const input = host.querySelector<HTMLInputElement>('input:not([type="checkbox"])')!;
  input.focus(); await settle();
  expect(document.activeElement).toBe(input);
  expect((await digit("1")).defaultPrevented).toBe(false);
  expect(checkboxes().every((checkbox) => !checkbox.checked)).toBe(true);
});

test("mouse selection followed by a digit works from both the option row and checkbox input", async () => {
  await render(); await settle();
  await act(async () => checkboxes()[0].closest("label")!.click());
  expect(checkboxes()[0].checked).toBe(true);
  option().focus(); await digit("2");
  expect(checkboxes()[1].checked).toBe(true);
  // Covers a checkbox focus target even though the production CSS hides it.
  checkboxes()[0].focus(); await digit("2");
  expect(checkboxes()[1].checked).toBe(false);
  expect(submit).not.toHaveBeenCalled();
});

test("a digit on the focused shell submits a single-choice answer once", async () => {
  await render({ ...data, questions: [{ ...data.questions[0], type: AIAwaitQuestionType.Select }] });
  await settle(); host.querySelector<HTMLElement>(".composer-awaiting-shell")!.focus();
  await digit("2"); await settle();
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({
    awaitingId: "ask", params: [{ id: "choice", answer: "Two" }],
  }));
});

test("changing questions focuses the new panel after its animation", async () => {
  await render({ ...data, questions: [data.questions[0], {
    id: "text", question: "Details", type: AIAwaitQuestionType.Text,
  }] });
  await settle();
  await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
  await settle();
  expect(document.activeElement?.tagName).toBe("INPUT");
  expect(document.activeElement?.closest(".hitl-dialog-surface")?.textContent).toContain("Details");
});

test("resolving an awaiting cancels its pending autofocus", async () => {
  await render(); await render({ ...data, resolutionReason: "remote_answered" });
  const focus = jest.spyOn(HTMLElement.prototype, "focus");
  await settle(); expect(focus).not.toHaveBeenCalled();
});

test("a hidden guest does not steal focus when the timer fires", async () => {
  jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  await render();
  const focus = jest.spyOn(HTMLElement.prototype, "focus");
  await settle(); expect(focus).not.toHaveBeenCalled();
});

test("unmount cancels pending autofocus", async () => {
  await render(); await act(async () => root.render(null));
  const focus = jest.spyOn(HTMLElement.prototype, "focus");
  await settle(); expect(focus).not.toHaveBeenCalled();
});

test("sidebar digits select choices while delayed autofocus leaves the guest unfocused", async () => {
  jest.spyOn(document, "hasFocus").mockReturnValue(false);
  const focus = jest.spyOn(HTMLElement.prototype, "focus");
  await render(); await settle();
  expect(focus).not.toHaveBeenCalled();
  await act(async () => {
    expect(dispatchDesktopAwaitingDigit({ type: DESKTOP_AWAITING_DIGIT_MESSAGE_TYPE, chatId: "chat", agentKey: "agent", digit: "2" }, {
      state: { chatId: "chat", activeAwaiting: data, chatTransition: null, chatSurfaceBlocked: false },
      renderedAwaiting: data, pathname: "/agent/agent", search: "?chatId=chat", blocked: false,
    })).toBe(true);
  });
  expect(checkboxes()[1].checked).toBe(true);
  expect(focus).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});
test("sidebar single-choice digit submits through the same question handler", async () => {
  jest.spyOn(document, "hasFocus").mockReturnValue(false);
  const single = { ...data, questions: [{ ...data.questions[0], type: AIAwaitQuestionType.Select }] };
  await render(single); await settle();
  await act(async () => {
    dispatchDesktopAwaitingDigit({ type: DESKTOP_AWAITING_DIGIT_MESSAGE_TYPE, chatId: "chat", agentKey: "agent", digit: "1" }, {
      state: { chatId: "chat", activeAwaiting: single, chatTransition: null, chatSurfaceBlocked: false },
      renderedAwaiting: single, pathname: "/agent/agent", search: "?chatId=chat", blocked: false,
    });
  });
  await settle(); expect(submit).toHaveBeenCalledTimes(1);
  expect(submit.mock.calls[0][0]).toMatchObject({ runId: "run", awaitingId: "ask" });
});
