/** @jest-environment jsdom */
import React, { act, useReducer, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { appReducer, createInitialState } from "@/app/state/AppContext";
import type { AppContextValue } from "@/app/state/AppContext";
import type { Agent } from "@/features/agents/lib/agentState";
import { getVoiceCapabilities } from "@/shared/data";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { useVoiceChatRuntime } from "./useVoiceChatRuntime";
import { VoiceShortcutSettings } from "../components/VoiceShortcutSettings";
import { defaultVoiceShortcut } from "../lib/voiceShortcut";
import { t } from "@/shared/i18n";

let context: Pick<AppContextValue, "state" | "dispatch" | "stateRef">;
const setInterruptionMode = jest.fn(), listen = jest.fn(), close = jest.fn(), prepare = jest.fn(async () => undefined), connect = jest.fn(), abort = jest.fn(), stopListening = jest.fn(), setMuted = jest.fn();
let options: { onRun: (chatId: string, runId: string) => void };
const construct = jest.fn();
jest.mock("@/app/state/AppContext", () => ({ ...jest.requireActual("@/app/state/AppContext"), useAppContext: () => context, useAppState: () => context.state, useAppDispatch: () => context.dispatch }));
jest.mock("../lib/voiceSession", () => ({ VoiceSession: jest.fn().mockImplementation(value => { options = value; construct(value); return { setInterruptionMode, prepare, connect, close, listen, abort, stopListening, setMuted }; }) }));
jest.mock("@/shared/config/featureFlags", () => ({ ...jest.requireActual("@/shared/config/featureFlags"), isVoiceEnabled: () => true }));
jest.mock("@/shared/data", () => ({ ...jest.requireActual("@/shared/data"), getVoiceCapabilities: jest.fn(async () => ({ enabled: true, version: 2, defaultVoice: "voice", voices: [{ id: "voice", label: "Voice" }, { id: "other", label: "Other" }] })), ensureAccessToken: async () => "fixture-token" }));
jest.mock("@/shared/utils/routing", () => ({ ...jest.requireActual("@/shared/utils/routing"), isDesktopAppMode: jest.fn(() => false) }));

function Harness() {
  const [state, dispatch] = useReducer(appReducer, undefined, () => {
    const state = createInitialState(); state.workerSelectionKey = "agent:agent";
    state.agents = [{ key: "agent", name: "Agent", mode: "GENERAL" } as Agent]; return state;
  });
  const stateRef = useRef(state); stateRef.current = state;
  context = { state, dispatch, stateRef };
  useVoiceChatRuntime(); return <VoiceShortcutSettings />;
}
let root: Root, container: HTMLDivElement;
beforeEach(async () => {
  jest.clearAllMocks();
  prepare.mockResolvedValue(undefined);
  localStorage.clear();
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
  { desktop: false, primaryNavigation: true, hasPrimary: false, search: "", primary: false },
  { desktop: false, primaryNavigation: true, hasPrimary: true, search: "", primary: false },
  { desktop: true, primaryNavigation: true, hasPrimary: true, search: "?newChat=1793000000000", primary: false },
  { desktop: true, primaryNavigation: false, hasPrimary: true, search: "?newChat=1793000000000&primaryNewChat=true", primary: false },
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
it("preserves hidden-page media and still releases it on pagehide", async () => {
  await start();
  act(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  expect(close).not.toHaveBeenCalled(); expect(context.state.inputMode).toBe("voice");
  act(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
  expect(construct).toHaveBeenCalledTimes(1);
  act(() => window.dispatchEvent(new Event("pagehide")));
  expect(close).toHaveBeenCalledTimes(1); expect(context.state.inputMode).toBe("text");
  act(() => options.onRun("late-chat", "late-run"));
  expect(context.state.chatId).toBe(""); expect(abort).not.toHaveBeenCalled();
});

it.each(["MacIntel", "Win32"])("starts once from a burst of native macro pulses on %s", async platform => {
  const previous = navigator.platform;
  Object.defineProperty(navigator, "platform", { configurable: true, value: platform });
  const focused = jest.spyOn(document, "hasFocus").mockReturnValue(true);
  try {
    act(() => context.dispatch({ type: "SET_VOICE_SHORTCUT", shortcut: defaultVoiceShortcut() }));
    await act(async () => {
      for (let i = 0; i < 8; i++) document.dispatchEvent(new KeyboardEvent("keydown", { ...defaultVoiceShortcut(), bubbles: true, cancelable: true }));
    });
    expect(context.state.inputMode).toBe("voice"); expect(construct).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledTimes(1); expect(connect).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
  } finally { focused.mockRestore(); Object.defineProperty(navigator, "platform", { configurable: true, value: previous }); }
});

it("does not connect a late microphone preparation after a Chat switch", async () => {
  let ready!: () => void;
  prepare.mockImplementationOnce(() => new Promise<void>(resolve => { ready = resolve; }));
  act(() => window.dispatchEvent(new CustomEvent("agent:voice-start")));
  act(() => context.dispatch({ type: "SET_CHAT_ID", chatId: "other" }));
  await act(async () => ready());
  expect(close).toHaveBeenCalledTimes(1); expect(connect).not.toHaveBeenCalled();
  expect(context.state.inputMode).toBe("text");
});

it("blocks start events as well as shortcuts while an ordinary Run is active", () => {
  act(() => context.dispatch({ type: "SET_CHAT_ID", chatId: "chat" }));
  act(() => context.dispatch({ type: "SET_CURRENT_CHAT_ACTIVE_RUN", activeRun: {
    chatId: "chat", runId: "run", agentKey: "agent", owner: { kind: "agent", agentKey: "agent" },
  } }));
  act(() => window.dispatchEvent(new CustomEvent("agent:voice-start")));
  expect(prepare).not.toHaveBeenCalled(); expect(context.state.inputMode).toBe("text");
});

it("records and tests without media, then rebinds without closing the ongoing session", async () => {
  const focused = jest.spyOn(document, "hasFocus").mockReturnValue(true);
  const button = (key: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent === t(key))!;
  const press = (target: EventTarget, code: string, extra: KeyboardEventInit = {}) => act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { code, key: code, bubbles: true, cancelable: true, ...extra }));
  });
  try {
    act(() => button("voice.shortcut.record").click());
    press(document.activeElement!, "F13");
    act(() => button("voice.shortcut.save").click());
    act(() => button("voice.shortcut.test").click());
    press(document.activeElement!, "F13");
    expect(container.textContent).toContain(t("voice.shortcut.matched", { shortcut: "F13" }));
    expect(prepare).not.toHaveBeenCalled(); expect(listen).not.toHaveBeenCalled();
    press(document.activeElement!, "Escape");
    await start();
    act(() => context.dispatch({ type: "PATCH_VOICE_CHAT", patch: { sessionActive: true, status: "speaking" } }));
    act(() => button("voice.shortcut.record").click()); press(document.activeElement!, "F14");
    act(() => button("voice.shortcut.save").click());
    press(document, "F13"); expect(listen).not.toHaveBeenCalled();
    press(document, "F14"); expect(listen).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled(); expect(construct).toHaveBeenCalledTimes(1);
    act(() => button("voice.shortcut.disable").click()); press(document, "F14");
    expect(listen).toHaveBeenCalledTimes(1);
  } finally { focused.mockRestore(); }
});

it("allows voice dropdown focus and consumes a shortcut before window-level question handlers", async () => {
  await start();
  act(() => context.dispatch({ type: "PATCH_VOICE_CHAT", patch: { sessionActive: true } }));
  const focused = jest.spyOn(document, "hasFocus").mockReturnValue(true);
  const question = jest.fn(); window.addEventListener("keydown", question);
  const host = document.createElement("div"); host.dataset.voiceControls = "";
  const select = document.createElement("select"); host.append(select); document.body.append(host);
  try {
    act(() => select.dispatchEvent(new KeyboardEvent("keydown", { ...defaultVoiceShortcut(), bubbles: true, cancelable: true })));
    expect(listen).toHaveBeenCalledTimes(1); expect(question).not.toHaveBeenCalled();
    delete host.dataset.voiceControls;
    act(() => select.dispatchEvent(new KeyboardEvent("keydown", { ...defaultVoiceShortcut(), bubbles: true, cancelable: true })));
    expect(listen).toHaveBeenCalledTimes(1);
  } finally { focused.mockRestore(); host.remove(); window.removeEventListener("keydown", question); }
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

it("keeps a non-GENERAL voice Chat ordinary even with explicit primary intent", async () => {
  jest.mocked(isDesktopAppMode).mockReturnValue(true);
  window.history.replaceState({}, "", "/agent/agent?newChat=1793000000000&primaryNewChat=true");
  act(() => {
    context.dispatch({ type: "SET_PRIMARY_NAVIGATION", enabled: true });
    context.dispatch({ type: "SET_AGENTS", agents: [{ ...context.state.agents[0], mode: "CODER" }] });
  });
  await start();
  expect(construct).toHaveBeenLastCalledWith(expect.objectContaining({ newChat: true, primary: false }));
});

it("shares the focused page shortcut with speak and ignores editing, repeat and composition", async () => {
  await start();
  const focused = jest.spyOn(document, "hasFocus").mockReturnValue(true);
  act(() => context.dispatch({ type: "PATCH_VOICE_CHAT", patch: { sessionActive: true } }));
  const press = (target: EventTarget = document, extra: KeyboardEventInit = {}) => {
    act(() => target.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true, ...extra })));
  };
  try {
    press(); expect(listen).toHaveBeenCalledTimes(1); expect(abort).not.toHaveBeenCalled();
    press(document, { repeat: true }); press(document, { isComposing: true });
    press(document, { altKey: true }); press(document, { ctrlKey: false });
    const input = document.createElement("input"); input.type = "password"; document.body.append(input);
    try { press(input); } finally { input.remove(); }
    const editable = document.createElement("div"); editable.contentEditable = "true"; editable.setAttribute("contenteditable", "true"); document.body.append(editable);
    try { press(editable); } finally { editable.remove(); }
    focused.mockReturnValue(false); press(); focused.mockReturnValue(true);
    act(() => context.dispatch({ type: "PATCH_VOICE_CHAT", patch: { sessionActive: false } })); press();
    expect(listen).toHaveBeenCalledTimes(1); expect(abort).not.toHaveBeenCalled();
  } finally { focused.mockRestore(); }
});

it("attaches a late Run without replacing the current media status", async () => {
  await start();
  act(() => context.dispatch({ type: "PATCH_VOICE_CHAT", patch: { status: "listening", sessionActive: true } }));
  act(() => options.onRun("canonical-chat", "late-run"));
  expect(context.state.voiceChat.status).toBe("listening");
  expect(context.state.chatId).toBe("canonical-chat");
});


it("switches interruption mode on the existing session and remembers the next start", async () => {
  await start();
  act(() => window.dispatchEvent(new CustomEvent("agent:voice-interruption-mode", { detail: "duplex" })));
  expect(setInterruptionMode).toHaveBeenCalledWith("duplex"); expect(construct).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled(); expect(context.state.voiceChat.interruptionMode).toBe("duplex");
  act(() => context.dispatch({ type: "RESET_ACTIVE_CONVERSATION" }));
  await act(async () => { window.dispatchEvent(new CustomEvent("agent:voice-start")); context.dispatch({ type: "SET_INPUT_MODE", mode: "voice" }); });
  expect(construct).toHaveBeenLastCalledWith(expect.objectContaining({ interruptionMode: "duplex" }));
});
