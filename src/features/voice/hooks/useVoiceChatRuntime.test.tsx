/** @jest-environment jsdom */
import React, { act, useReducer, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { appReducer, createInitialState } from "@/app/state/AppContext";
import type { AppContextValue } from "@/app/state/AppContext";
import type { Agent } from "@/features/agents/lib/agentState";
import { getVoiceCapabilities } from "@/shared/data";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { useVoiceChatRuntime } from "./useVoiceChatRuntime";

let context: Pick<AppContextValue, "state" | "dispatch" | "stateRef">;
const close = jest.fn(), prepare = jest.fn(async () => undefined), connect = jest.fn(), abort = jest.fn(), stopListening = jest.fn(), setMuted = jest.fn();
let options: { onRun: (chatId: string, runId: string) => void };
const construct = jest.fn();
jest.mock("@/app/state/AppContext", () => ({ ...jest.requireActual("@/app/state/AppContext"), useAppContext: () => context }));
jest.mock("../lib/voiceSession", () => ({ VoiceSession: jest.fn().mockImplementation(value => { options = value; construct(value); return { prepare, connect, close, abort, stopListening, setMuted }; }) }));
jest.mock("@/shared/config/featureFlags", () => ({ ...jest.requireActual("@/shared/config/featureFlags"), isVoiceEnabled: () => true }));
jest.mock("@/shared/data", () => ({ ...jest.requireActual("@/shared/data"), getVoiceCapabilities: jest.fn(async () => ({ enabled: true, version: 1, defaultVoice: "voice", voices: [{ id: "voice", label: "Voice" }, { id: "other", label: "Other" }] })), ensureAccessToken: async () => "fixture-token" }));
jest.mock("@/shared/utils/routing", () => ({ ...jest.requireActual("@/shared/utils/routing"), isDesktopAppMode: jest.fn(() => false) }));

function Harness() {
  const [state, dispatch] = useReducer(appReducer, undefined, () => {
    const state = createInitialState(); state.workerSelectionKey = "agent:agent";
    state.agents = [{ key: "agent", name: "Agent" } as Agent]; return state;
  });
  const stateRef = useRef(state); stateRef.current = state;
  context = { state, dispatch, stateRef };
  useVoiceChatRuntime(); return null;
}
let root: Root, container: HTMLDivElement;
beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(isDesktopAppMode).mockReturnValue(false);
  window.history.replaceState({}, "", "/");
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function start() {
  await act(async () => {
    window.dispatchEvent(new CustomEvent("agent:voice-start"));
    expect(prepare).toHaveBeenCalledTimes(1); // Synchronous in the user gesture.
    context.dispatch({ type: "SET_INPUT_MODE", mode: "voice" });
  });
}
it("binds canonical IDs through the existing attach event without losing the media session", async () => {
  const attached = jest.fn(), promoted = jest.fn(); window.addEventListener("agent:attach-run", attached);
  window.addEventListener("agent:new-chat-created", promoted);
  try {
    await start(); expect(connect).toHaveBeenCalledWith("fixture-token");
    act(() => options.onRun("canonical-chat", "canonical-run"));
    expect(context.state.chatId).toBe("canonical-chat");
    expect(context.state.inputMode).toBe("voice");
    expect(close).not.toHaveBeenCalled();
    expect(attached).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ chatId: "canonical-chat", runId: "canonical-run", lastSeq: 0 }) }));
    expect(promoted).toHaveBeenCalledWith(expect.objectContaining({ detail: { chatId: "canonical-chat", agentKey: "agent" } }));
    act(() => options.onRun("canonical-chat", "second-run"));
    expect(promoted).toHaveBeenCalledTimes(1);
    act(() => context.dispatch({ type: "SET_INPUT_MODE", mode: "text" }));
    expect(close).toHaveBeenCalledTimes(1); expect(abort).not.toHaveBeenCalled();
  } finally { window.removeEventListener("agent:attach-run", attached); window.removeEventListener("agent:new-chat-created", promoted); }
});
it("starts a new Chat even when the Agent already has a primary Chat", async () => {
  act(() => {
    context.dispatch({ type: "SET_AGENTS", agents: [{ ...context.state.agents[0], primaryChat: { chatId: "old-primary" } } as Agent] });
    context.dispatch({ type: "SET_CHAT_ID", chatId: "old-primary" });
  });
  act(() => {
    context.dispatch({ type: "SET_CHAT_ID", chatId: "" });
    context.dispatch({ type: "RESET_ACTIVE_CONVERSATION" });
  });
  await start();
  expect(construct).toHaveBeenLastCalledWith(expect.objectContaining({ chatId: "", newChat: true, primary: false }));
  act(() => options.onRun("fresh-chat", "fresh-run"));
  expect(context.state.chatId).toBe("fresh-chat");
});
it.each([
  { desktop: false, primaryNavigation: false, hasPrimary: false, search: "", primary: false },
  { desktop: false, primaryNavigation: true, hasPrimary: false, search: "", primary: true },
  { desktop: false, primaryNavigation: true, hasPrimary: true, search: "", primary: false },
  { desktop: true, primaryNavigation: true, hasPrimary: true, search: "?newChat=1793000000000", primary: false },
  { desktop: true, primaryNavigation: false, hasPrimary: true, search: "?newChat=1793000000000&primaryNewChat=true", primary: true },
])("uses the ordinary new-Chat primary intent: %j", async ({ desktop, primaryNavigation, hasPrimary, search, primary }) => {
  jest.mocked(isDesktopAppMode).mockReturnValue(desktop);
  window.history.replaceState({}, "", `/agent/agent${search}`);
  act(() => {
    context.dispatch({ type: "SET_PRIMARY_NAVIGATION", enabled: primaryNavigation });
    context.dispatch({ type: "SET_AGENTS", agents: [{ ...context.state.agents[0], primaryChat: hasPrimary ? { chatId: "old-primary" } : undefined } as Agent] });
  });
  await start();
  expect(construct).toHaveBeenLastCalledWith(expect.objectContaining({ chatId: "", newChat: true, primary }));
});
it("continues an existing Chat without carrying new-Chat intent", async () => {
  act(() => context.dispatch({ type: "SET_CHAT_ID", chatId: "history-chat" }));
  await start();
  expect(construct).toHaveBeenLastCalledWith(expect.objectContaining({ chatId: "history-chat", newChat: false, primary: false }));
});
it("preserves current media and recognized text while the same Chat history is replayed", async () => {
  await start();
  act(() => context.dispatch({ type: "PATCH_VOICE_CHAT", patch: { partialUserText: "first question" } }));
  act(() => options.onRun("canonical-chat", "canonical-run"));
  const voice = context.state.voiceChat;
  act(() => context.dispatch({ type: "RESET_CONVERSATION", preserveVoiceSession: true }));
  expect(context.state.voiceChat).toBe(voice);
  expect(context.state.voiceChat.partialUserText).toBe("first question");
  expect(context.state.inputMode).toBe("voice"); expect(close).not.toHaveBeenCalled();
  act(() => context.dispatch({ type: "RESET_CONVERSATION" }));
  expect(close).toHaveBeenCalledTimes(1); expect(context.state.inputMode).toBe("text");
});
it("releases media on a Chat switch even before the first Query created a Chat", async () => {
  await start();
  act(() => context.dispatch({ type: "SET_CHAT_ID", chatId: "another-chat" }));
  expect(close).toHaveBeenCalledTimes(1); expect(context.state.inputMode).toBe("text");
  expect(abort).not.toHaveBeenCalled();
});
it("releases hidden-page media and ignores a late Run callback", async () => {
  await start();
  act(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  expect(close).toHaveBeenCalledTimes(1); expect(context.state.inputMode).toBe("text");
  act(() => options.onRun("late-chat", "late-run"));
  expect(context.state.chatId).toBe(""); expect(abort).not.toHaveBeenCalled();
});


it.each(["online", "connected"])("retries failed capabilities on %s without opening media", async recovery => {
  jest.mocked(getVoiceCapabilities).mockRejectedValueOnce(new Error("offline"));
  await act(async () => context.dispatch({ type: "SET_ACCESS_TOKEN", token: "new-token" }));
  const count = jest.mocked(getVoiceCapabilities).mock.calls.length;
  await act(async () => {
    if (recovery === "online") window.dispatchEvent(new Event("online"));
    else context.dispatch({ type: "SET_WS_STATUS", status: "connected" });
  });
  expect(getVoiceCapabilities).toHaveBeenCalledTimes(count + 1);
  expect(context.state.voiceChat.capabilities?.enabled).toBe(true);
  expect(prepare).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
});

it("preserves a valid selected voice and does not retry a disabled response", async () => {
  act(() => context.dispatch({ type: "PATCH_VOICE_CHAT", patch: { selectedVoice: "other" } }));
  await act(async () => context.dispatch({ type: "SET_ACCESS_TOKEN", token: "second-token" }));
  expect(context.state.voiceChat.selectedVoice).toBe("other");
  const capabilities = context.state.voiceChat.capabilities!;
  jest.mocked(getVoiceCapabilities).mockResolvedValueOnce({ ...capabilities, enabled: false });
  await act(async () => context.dispatch({ type: "SET_ACCESS_TOKEN", token: "disabled-token" }));
  const count = jest.mocked(getVoiceCapabilities).mock.calls.length;
  await act(async () => {
    window.dispatchEvent(new Event("online"));
    context.dispatch({ type: "SET_WS_STATUS", status: "connected" });
  });
  expect(getVoiceCapabilities).toHaveBeenCalledTimes(count);
  expect(context.state.voiceChat.capabilities?.enabled).toBe(false);
});

it("deduplicates recovery events and ignores a late response from the previous identity", async () => {
  let resolve!: (value: NonNullable<typeof context.state.voiceChat.capabilities>) => void;
  const previous = context.state.voiceChat.capabilities!;
  jest.mocked(getVoiceCapabilities).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await act(async () => context.dispatch({ type: "SET_ACCESS_TOKEN", token: "pending-token" }));
  const count = jest.mocked(getVoiceCapabilities).mock.calls.length;
  await act(async () => { window.dispatchEvent(new Event("online")); window.dispatchEvent(new Event("online")); });
  expect(getVoiceCapabilities).toHaveBeenCalledTimes(count);
  await act(async () => context.dispatch({ type: "SET_ACCESS_TOKEN", token: "replacement-token" }));
  await act(async () => resolve({ ...previous, enabled: false }));
  expect(context.state.voiceChat.capabilities?.enabled).toBe(true);
});
