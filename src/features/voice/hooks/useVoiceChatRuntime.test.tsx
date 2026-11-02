/** @jest-environment jsdom */
import React, { act, useReducer, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { appReducer, createInitialState } from "@/app/state/AppContext";
import type { AppContextValue } from "@/app/state/AppContext";
import type { Agent } from "@/features/agents/lib/agentState";
import { useVoiceChatRuntime } from "./useVoiceChatRuntime";

let context: Pick<AppContextValue, "state" | "dispatch" | "stateRef">;
const close = jest.fn(), prepare = jest.fn(async () => undefined), connect = jest.fn(), abort = jest.fn(), stopListening = jest.fn(), setMuted = jest.fn();
let options: { onRun: (chatId: string, runId: string) => void };
const construct = jest.fn();
jest.mock("@/app/state/AppContext", () => ({ ...jest.requireActual("@/app/state/AppContext"), useAppContext: () => context }));
jest.mock("../lib/voiceSession", () => ({ VoiceSession: jest.fn().mockImplementation(value => { options = value; construct(value); return { prepare, connect, close, abort, stopListening, setMuted }; }) }));
jest.mock("@/shared/config/featureFlags", () => ({ ...jest.requireActual("@/shared/config/featureFlags"), isVoiceEnabled: () => true }));
jest.mock("@/shared/data", () => ({ ...jest.requireActual("@/shared/data"), getVoiceCapabilities: async () => ({ enabled: true, version: 1, defaultVoice: "voice", voices: [] }), ensureAccessToken: async () => "fixture-token" }));
jest.mock("@/shared/utils/routing", () => ({ ...jest.requireActual("@/shared/utils/routing"), isDesktopAppMode: () => false }));

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
