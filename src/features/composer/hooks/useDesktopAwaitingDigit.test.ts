/** @jest-environment jsdom */
jest.mock("react-router-dom", () => ({ useLocation: () => ({ pathname: "/agent/agent", search: "?chatId=chat-a" }) }));
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { AppState } from "@/app/state/AppContext";
import { useDesktopAwaitingDigit, dispatchDesktopAwaitingDigit, DESKTOP_AWAITING_DIGIT_MESSAGE_TYPE, type AwaitingDigitState } from "./useDesktopAwaitingDigit";
import { clearAllAwaitingSubmitIdsForTest, rememberAwaitingSubmitId, clearAwaitingSubmitId } from "@/features/tools/lib/awaitingSubmitTracker";

jest.mock("@/shared/utils/routing", () => ({ isAppMode: () => true }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const awaiting: NonNullable<AwaitingDigitState["activeAwaiting"]> = {
  key: "run:ask", runId: "run", awaitingId: "ask", agentKey: "agent", mode: "question", questions: [], timeout: null,
};
const state: AwaitingDigitState = { chatId: "chat-a", activeAwaiting: awaiting, chatTransition: null, chatSurfaceBlocked: false };
const request = { type: DESKTOP_AWAITING_DIGIT_MESSAGE_TYPE, chatId: "chat-a", agentKey: "agent", digit: "2" };
const input = { state, renderedAwaiting: awaiting, pathname: "/agent/agent", search: "?chatId=chat-a", blocked: false };
let keys: string[];
const onKeyDown = (event: KeyboardEvent) => { keys.push(event.key); event.preventDefault(); };
beforeEach(() => {
  clearAllAwaitingSubmitIdsForTest(); keys = [];
  jest.spyOn(document, "hasFocus").mockReturnValue(false);
  window.addEventListener("keydown", onKeyDown);
});
afterEach(() => { window.removeEventListener("keydown", onKeyDown); jest.restoreAllMocks(); document.body.replaceChildren(); });

test("delivers digits through the existing handler without focusing a guest element", () => {
  const staleInput = document.createElement("input"); document.body.append(staleInput); staleInput.focus();
  const focus = jest.spyOn(HTMLElement.prototype, "focus");
  expect(dispatchDesktopAwaitingDigit(request, input)).toBe(true);
  expect(keys).toEqual(["2"]); expect(focus).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(staleInput);
});

test.each([
  { chatId: "other" }, { agentKey: "other" }, { digit: "0" }, { digit: "Enter" },
  { digit: "12" }, { digit: 2 }, { type: "other" },
])("rejects invalid or mismatched input %j", (patch) => {
  expect(dispatchDesktopAwaitingDigit({ ...request, ...patch }, input)).toBe(false);
  expect(keys).toEqual([]);
});

test.each([
  { pathname: "/copilot/agent" }, { search: "?chatId=other" }, { blocked: true },
  { state: { ...state, chatId: "other" } },
  { state: { ...state, chatSurfaceBlocked: true } },
  { state: { ...state, activeAwaiting: null } },
  { renderedAwaiting: { ...awaiting, awaitingId: "older" } },
  { renderedAwaiting: { ...awaiting, runId: "older" } },
  { state: { ...state, activeAwaiting: { ...awaiting, resolutionReason: "remote_answered" as const } } },
])("drops keys during navigation, resolution, or overlays %j", (patch) => {
  expect(dispatchDesktopAwaitingDigit(request, { ...input, ...patch })).toBe(false);
  expect(keys).toEqual([]);
});

test("does not inject into a guest that has since received keyboard focus", () => {
  jest.spyOn(document, "hasFocus").mockReturnValue(true);
  expect(dispatchDesktopAwaitingDigit(request, input)).toBe(false);
  expect(keys).toEqual([]);
});
test("visible guest modal blocks forwarding", () => {
  const modal = document.createElement("div"); modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
  document.body.append(modal); jest.spyOn(modal, "getClientRects").mockReturnValue([{}] as any);
  expect(dispatchDesktopAwaitingDigit(request, input)).toBe(false); expect(keys).toEqual([]);
});
test("in-flight submit blocks duplicates, but a failed submit permits retry even with a stale pendingSubmitId", () => {
  rememberAwaitingSubmitId("run", "ask", "submit");
  expect(dispatchDesktopAwaitingDigit(request, input)).toBe(false);
  clearAwaitingSubmitId("run", "ask");
  expect(dispatchDesktopAwaitingDigit(request, {
    ...input, state: { ...state, activeAwaiting: { ...awaiting, pendingSubmitId: "submit" } },
  })).toBe(true);
  expect(keys).toEqual(["2"]);
});

test("the mounted hook accepts only host messages and rechecks live Chat state", async () => {
  (window as any).__DESKTOP_WEBVIEW_BRIDGE__ = true;
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const snapshot = state as AppState;
  const stateRef = { current: snapshot };
  function Harness() {
    useDesktopAwaitingDigit({ state: snapshot, stateRef, blocked: false });
    return null;
  }
  const send = (source: Window | null) => window.dispatchEvent(new MessageEvent("message", { source, data: request }));
  try {
    await act(async () => root.render(React.createElement(Harness)));
    send(null); expect(keys).toEqual([]);
    send(window); expect(keys).toEqual(["2"]);
    stateRef.current = { ...snapshot, chatId: "chat-b" };
    send(window); expect(keys).toEqual(["2"]);
    stateRef.current = { ...snapshot, activeAwaiting: { ...awaiting, awaitingId: "new-ask" } };
    send(window); expect(keys).toEqual(["2"]);
  } finally {
    await act(async () => root.unmount()); host.remove();
    stateRef.current = snapshot;
    send(window); expect(keys).toEqual(["2"]);
    delete (window as any).__DESKTOP_WEBVIEW_BRIDGE__;
  }
});
