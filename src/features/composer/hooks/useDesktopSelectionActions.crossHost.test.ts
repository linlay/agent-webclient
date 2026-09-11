/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MessageInstance } from "antd/es/message/interface";
import type { QueryModelOverride } from "@/shared/data";
import type { RunCompletion, RunExecution, RunIdentity } from "@/features/transport/contracts/realtimeTransport";
import { createSelectedTextFragment } from "@/features/selection/lib/selectedTextReference";
import { DESKTOP_SELECTION_BTW_TARGET } from "@/features/selection/lib/selectionTransfer";
import { BtwProvider, useOptionalBTW } from "@/features/btw/components/BtwProvider";
import { useDesktopSelectionActions } from "./useDesktopSelectionActions";

const mockStartBtw = jest.fn();
const mockRuns = { startBtw: mockStartBtw, subscribe: jest.fn(), interrupt: jest.fn() };
const mockOpenTarget = jest.fn();
const mockStageTransfer = jest.fn();
const mockCancelTransfer = jest.fn();
const mockHostHandler = jest.fn();
const mockMessageApi = { warning: jest.fn(), error: jest.fn() };
const mockAddMainFragment = jest.fn();
const mockDispatch = jest.fn();
let mockDesktopMode = false;
let mockUseRealBtw = false;
let mockRequestSequence = 0;
let mockState: any;
let mockContext: any;
let mockBtw: any;

jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ useRunTransport: () => mockRuns }));
jest.mock("@/features/surfaces/openTarget", () => ({ useOpenTarget: () => mockOpenTarget }));
jest.mock("@/app/state/AppContext", () => ({
  useAppState: () => mockState,
  useAppContext: () => mockContext,
}));
jest.mock("@/shared/data", () => ({ createRequestId: (prefix: string) => `${prefix}-${++mockRequestSequence}` }));
jest.mock("@/shared/data/desktop/desktopContextMenu", () => ({
  useDesktopSelectionActionHandler: (handler: unknown) => mockHostHandler(handler),
}));
jest.mock("@/shared/utils/routing", () => ({
  ...jest.requireActual("@/shared/utils/routing"),
  isDesktopAppMode: () => mockDesktopMode,
}));
jest.mock("@/shared/i18n", () => {
  const t = (key: string) => key === "platformError.generic" ? "The request failed. Please try again." : key;
  return { useI18n: () => ({ t }), t };
});
jest.mock("@/features/selection/lib/selectionTransfer", () => ({
  ...jest.requireActual("@/features/selection/lib/selectionTransfer"),
  stageSelectedTextTransfer: (input: unknown) => mockStageTransfer(input),
  cancelSelectedTextTransfer: (id: string) => mockCancelTransfer(id),
}));
jest.mock("@/features/btw/components/BtwProvider", () => {
  const actual = jest.requireActual("@/features/btw/components/BtwProvider");
  return { ...actual, useOptionalBTW: () => mockUseRealBtw ? actual.useOptionalBTW() : mockBtw };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const model: QueryModelOverride = { key: "chat-model", reasoningEffort: "HIGH" };
const fragment = createSelectedTextFragment({ text: "selected answer", targetId: "message-a", sourceKind: "message" })!;
const roots = new Set<Root>();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function execution() {
  const identity = deferred<RunIdentity>();
  const completion = deferred<RunCompletion>();
  const value: RunExecution = { identity: identity.promise, completion: completion.promise, detach: jest.fn(async () => {}) };
  return { identity, completion, value };
}

const identity = (runId = "explain-run", chatId = "chat-a"): RunIdentity => ({
  requestId: "transport-request", chatId, runId, owner: { kind: "agent", agentKey: "agent-a" },
});

function mount(options: { realBtw?: boolean; strict?: boolean } = {}) {
  mockUseRealBtw = Boolean(options.realBtw);
  let current!: ReturnType<typeof useDesktopSelectionActions>;
  let btw: ReturnType<typeof useOptionalBTW> = null;
  let pendingClick: ReturnType<typeof current.handleAction> | undefined;
  let renders = 0;
  function Harness() {
    current = useDesktopSelectionActions({ addMainFragment: mockAddMainFragment, model,
      messageApi: mockMessageApi as unknown as MessageInstance });
    btw = useOptionalBTW();
    renders++;
    return React.createElement("button", { onClick: () => {
      pendingClick = current.handleAction({ action: "more-details", fragment });
    } }, "Explain selection");
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.add(root);
  const render = () => act(() => {
    let tree: React.ReactElement = React.createElement(Harness);
    if (options.realBtw) tree = React.createElement(BtwProvider, null, tree);
    if (options.strict) tree = React.createElement(React.StrictMode, null, tree);
    root.render(tree);
  });
  render();
  return {
    get actions() { return current; }, get btw() { return btw; }, get renders() { return renders; },
    render,
    clickExplain() { act(() => container.querySelector("button")!.click()); return pendingClick!; },
    unmount() { act(() => root.unmount()); roots.delete(root); container.remove(); },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mockDesktopMode = false;
  mockUseRealBtw = false;
  mockRequestSequence = 0;
  mockState = { chatId: "chat-a", chats: [{ chatId: "chat-a", agentKey: "agent-a" }],
    chatAgentById: new Map([["chat-a", "agent-a"]]), currentRunAgentKey: "agent-a" };
  mockContext = { stateRef: { current: mockState }, dispatch: mockDispatch };
  mockBtw = { openBTW: jest.fn(() => true), addDraftSelection: jest.fn(() => true) };
  mockOpenTarget.mockReturnValue(true);
  mockAddMainFragment.mockReturnValue(true);
  mockStageTransfer.mockReturnValue({ transferId: "transfer-a", delivered: Promise.resolve(true) });
  mockStartBtw.mockReset();
});

afterEach(() => {
  act(() => { for (const root of roots) root.unmount(); });
  roots.clear();
  document.body.replaceChildren();
  jest.restoreAllMocks();
});

it.each([false, true])("adds a selection without sending on desktopMode=%s and only registers the Desktop host handler when needed", async (desktopMode) => {
  mockDesktopMode = desktopMode;
  const focus = jest.fn();
  window.addEventListener("agent:focus-composer", focus);
  const h = mount();
  const registered = mockHostHandler.mock.calls.at(-1)![0];
  expect(desktopMode ? typeof registered : registered).toBe(desktopMode ? "function" : null);
  await expect(h.actions.handleAction({ action: "add-to-chat", fragment })).resolves.toEqual({ ok: true });
  expect(mockAddMainFragment).toHaveBeenCalledTimes(1);
  expect(mockAddMainFragment).toHaveBeenCalledWith(fragment);
  expect(focus).toHaveBeenCalledTimes(1);
  expect(mockStartBtw).not.toHaveBeenCalled();
  expect(mockOpenTarget).not.toHaveBeenCalled();
  window.removeEventListener("agent:focus-composer", focus);
});

it("adds browser side questions to the existing real BTW draft without transfer, duplicate session, or automatic send", async () => {
  const h = mount({ realBtw: true });
  const previousFragment = createSelectedTextFragment({ text: "previous selection", targetId: "message-older", sourceKind: "message" })!;
  act(() => {
    h.btw!.openBTW({ parentChatId: "chat-a" });
    h.btw!.setDraft("chat-a", "unfinished question");
    h.btw!.addDraftSelection("chat-a", previousFragment);
  });
  const oldFocusToken = h.btw!.getSession("chat-a")!.focusToken;
  await act(async () => { expect(await h.actions.handleAction({ action: "ask-in-side-chat", fragment })).toEqual({ ok: true }); });
  expect(h.btw!.sessions.size).toBe(1);
  expect(h.btw!.getSession("chat-a")).toMatchObject({ draft: "unfinished question",
    draftSelections: [previousFragment, fragment], config: { model, accessLevel: "default" } });
  expect(h.btw!.getSession("chat-a")!.focusToken).toBeGreaterThan(oldFocusToken);
  expect(mockDispatch).toHaveBeenLastCalledWith({ type: "OPEN_RIGHT_SIDEBAR", tab: "btw" });
  expect(mockOpenTarget).not.toHaveBeenCalled();
  expect(mockStageTransfer).not.toHaveBeenCalled();
  expect(mockStartBtw).not.toHaveBeenCalled();
});

it("does not fall back to a host window when the browser BTW provider cannot open", async () => {
  mockBtw.openBTW.mockReturnValue(false);
  const h = mount();
  await expect(h.actions.handleAction({ action: "ask-in-side-chat", fragment })).resolves.toEqual({ ok: false, code: "surface_not_ready" });
  expect(mockBtw.addDraftSelection).not.toHaveBeenCalled();
  expect(mockStageTransfer).not.toHaveBeenCalled();
  expect(mockOpenTarget).not.toHaveBeenCalled();
});

it("Desktop side questions keep the WorkPanel transfer handshake and do not touch the browser draft", async () => {
  mockDesktopMode = true;
  const delivered = deferred<boolean>();
  mockStageTransfer.mockReturnValue({ transferId: "transfer-a", delivered: delivered.promise });
  const h = mount();
  const hostHandler = mockHostHandler.mock.calls.at(-1)![0];
  let settled = false;
  const action = hostHandler({ action: "ask-in-side-chat", fragment }).then((result: unknown) => { settled = true; return result; });
  await act(async () => {});
  expect(settled).toBe(false);
  expect(mockStageTransfer).toHaveBeenCalledWith({ targetId: DESKTOP_SELECTION_BTW_TARGET, chatId: "chat-a", fragment });
  expect(mockOpenTarget).toHaveBeenCalledTimes(1);
  expect(mockOpenTarget).toHaveBeenCalledWith({ version: 1, kind: "btw", chatId: "chat-a", instanceId: DESKTOP_SELECTION_BTW_TARGET,
    selectionTransferTarget: DESKTOP_SELECTION_BTW_TARGET, title: "selection.sideChat.title" });
  delivered.resolve(true);
  await expect(action).resolves.toEqual({ ok: true });
  expect(mockBtw.openBTW).not.toHaveBeenCalled();
  expect(mockBtw.addDraftSelection).not.toHaveBeenCalled();
});

it("cancels a Desktop transfer when WorkPanel refuses the target", async () => {
  mockDesktopMode = true;
  mockOpenTarget.mockReturnValue(false);
  const h = mount();
  await expect(h.actions.handleAction({ action: "ask-in-side-chat", fragment })).resolves.toEqual({ ok: false, code: "surface_not_ready" });
  expect(mockCancelTransfer).toHaveBeenCalledWith("transfer-a");
  expect(mockBtw.openBTW).not.toHaveBeenCalled();
});

it.each(["MacIntel", "Win32"])("Desktop %s starts explanation once on its dedicated purpose and returns only canonical identity", async (platform) => {
  mockDesktopMode = true;
  jest.spyOn(window.navigator, "platform", "get").mockReturnValue(platform);
  const run = execution();
  mockStartBtw.mockReturnValue(run.value);
  const h = mount({ strict: true });
  const action = h.clickExplain();
  expect(mockStartBtw).toHaveBeenCalledTimes(1);
  expect(mockStartBtw).toHaveBeenCalledWith(expect.objectContaining({
    requestId: "selection_explain-1", chatId: "chat-a", transportPurpose: "selection-explain",
    message: "selection.explain.prompt", accessLevel: "default", model, references: [fragment.reference], stream: true,
    owner: { kind: "agent", agentKey: "agent-a" },
  }));
  await act(async () => { run.identity.resolve(identity("run-host", "canonical-chat")); await action; });
  await expect(action).resolves.toEqual({ ok: true, handoff: { chatId: "canonical-chat", runId: "run-host" } });
  await act(async () => run.completion.resolve({ reason: "complete", lastSeq: 5 }));
  h.render();
  expect(mockStartBtw).toHaveBeenCalledTimes(1);
  expect(mockOpenTarget).not.toHaveBeenCalled();
  expect(mockBtw.openBTW).not.toHaveBeenCalled();
});

it.each(["MacIntel", "Win32"])("browser %s rejects detailed explanation before any transport or surface request", async (platform) => {
  jest.spyOn(window.navigator, "platform", "get").mockReturnValue(platform);
  const h = mount({ strict: true });
  await expect(h.clickExplain()).resolves.toEqual({ ok: false, code: "surface_not_ready" });
  expect(mockStartBtw).not.toHaveBeenCalled();
  expect(mockRuns.subscribe).not.toHaveBeenCalled();
  expect(mockRuns.interrupt).not.toHaveBeenCalled();
  expect(mockOpenTarget).not.toHaveBeenCalled();
  expect(mockBtw.openBTW).not.toHaveBeenCalled();
  expect(mockHostHandler.mock.calls.every(([handler]) => handler === null)).toBe(true);
});

it.each(["synchronous", "asynchronous"])("keeps a recoverable Desktop error after a %s start failure", async (failure) => {
  mockDesktopMode = true;
  const run = execution();
  if (failure === "synchronous") mockStartBtw.mockImplementation(() => { throw new Error("offline"); });
  else mockStartBtw.mockReturnValue(run.value);
  const h = mount();
  const action = h.clickExplain();
  await act(async () => {
    if (failure === "asynchronous") run.identity.reject(new Error("connection failed before acceptance"));
    expect(await action).toEqual({ ok: false, code: "run_start_failed" });
  });
  expect(mockStartBtw).toHaveBeenCalledTimes(1);
  expect(mockMessageApi.error).toHaveBeenCalledWith("The request failed. Please try again.");
  expect(mockOpenTarget).not.toHaveBeenCalled();
});

it("keeps a readable Platform rejection while returning only a stable Desktop action error", async () => {
  mockDesktopMode = true;
  const run = execution();
  mockStartBtw.mockReturnValue(run.value);
  const h = mount();
  const action = h.clickExplain();
  const message = "The selected Chat is unavailable for this side question.";
  await act(async () => {
    run.identity.reject({ frame: "error", type: "invalid_request", code: 400, msg: message,
      data: { error: { code: "invalid_request", category: "request", message: "internal diagnostic" } } });
    expect(await action).toEqual({ ok: false, code: "run_start_failed" });
  });
  expect(mockMessageApi.error).toHaveBeenLastCalledWith(message);
  expect(mockStartBtw).toHaveBeenCalledTimes(1);
});

it("unmounting a Desktop publisher does not restart its accepted explanation", async () => {
  mockDesktopMode = true;
  const run = execution();
  mockStartBtw.mockReturnValue(run.value);
  const h = mount();
  const action = h.clickExplain();
  h.unmount();
  const renders = h.renders;
  await act(async () => { run.identity.resolve(identity()); await action; });
  expect(h.renders).toBe(renders);
  expect(document.body.childElementCount).toBe(0);
  expect(mockStartBtw).toHaveBeenCalledTimes(1);
  expect(mockOpenTarget).not.toHaveBeenCalled();
});

it.each([
  { action: "more-details" as const, desktopMode: true },
  { action: "ask-in-side-chat" as const, desktopMode: true },
  { action: "ask-in-side-chat" as const, desktopMode: false },
])("requires an existing Chat for $action / desktop=$desktopMode", async ({ action, desktopMode }) => {
  mockDesktopMode = desktopMode;
  mockState.chatId = "";
  const h = mount();
  await expect(h.actions.handleAction({ action, fragment })).resolves.toEqual({ ok: false, code: "chat_required" });
  expect(mockMessageApi.warning).toHaveBeenCalledWith("selection.action.chatRequired");
  expect(mockStartBtw).not.toHaveBeenCalled();
  expect(mockBtw.openBTW).not.toHaveBeenCalled();
  expect(mockOpenTarget).not.toHaveBeenCalled();
});
