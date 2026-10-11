/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInitialState } from "@/app/state/state";
import { useVoiceChatListening } from "./useVoiceChatListening";
import type { VoiceChatRuntimeController } from "./useVoiceChatRuntimeController";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";

const mockStartQuery = jest.fn();
const mockLoadKBaseOptions = jest.fn();
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ useRunTransport: () => ({ startQuery: mockStartQuery }) }));
jest.mock("@/features/kbases/lib/kbaseOptions", () => ({
  ...jest.requireActual("@/features/kbases/lib/kbaseOptions"),
  loadKBaseOptions: (...args: unknown[]) => mockLoadKBaseOptions(...args),
}));
jest.mock("@/features/voice/lib/voiceRuntime", () => ({ getVoiceRuntime: () => null }));

const library = (id: string, readable = true) => ({ id, name: id, collections: [], readable, indexing: false, degraded: false });
const roots: Root[] = [];
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => { act(() => roots.splice(0).forEach(root => root.unmount())); });

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadKBaseOptions.mockReset();
  mockStartQuery.mockReturnValue({
    identity: Promise.resolve({ chatId: "chat", runId: "run", owner: { kind: "agent", agentKey: "general" } }),
    completion: Promise.resolve({ reason: "done", lastSeq: 1 }),
  });
});

function harness(ids: string[]) {
  const state = createInitialState();
  state.chatId = "chat";
  state.inputMode = "voice";
  state.chatAgentById.set("chat", "general");
  state.selectedKbasesByScope["chat:chat"] = ids.map(id => ({ id, name: id }));
  const fatal = jest.fn();
  const controller = {
    stateRef: { current: state }, createTurnNodes: jest.fn(), cancelListeningTransition: jest.fn(),
    ttsTaskActiveRef: { current: false }, bargeInProgressRef: { current: false },
    asrRestartPendingRef: { current: false }, asrStartInFlightRef: { current: false }, asrTaskActiveRef: { current: false },
    scheduleVoiceReconnectRef: { current: jest.fn() }, handleFatalError: fatal,
    patchVoiceChat: jest.fn(updates => { state.voiceChat = { ...state.voiceChat, ...updates }; }),
  };
  let actions!: ReturnType<typeof useVoiceChatListening>;
  function Probe() {
    actions = useVoiceChatListening({
      controller: controller as unknown as VoiceChatRuntimeController,
      currentWorker: { type: "agent", sourceId: "general", raw: { mode: "GENERAL" } } as CurrentWorkerSummary,
      dispatch: jest.fn(), handleEvent: jest.fn(), ensureAudioCapture: jest.fn(), resumeAudioCapture: jest.fn(), startAsrTask: () => true,
    });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  act(() => root.render(React.createElement(Probe)));
  return { state, controller, fatal, submit: () => actions.submitVoiceChatQuery("hello") };
}

it("freezes trimmed exact library IDs before asynchronous voice admission", async () => {
  const h = harness([" lib-a ", "lib-a", "LIB-A", ""]);
  let resolve!: (value: unknown) => void;
  mockLoadKBaseOptions.mockReturnValue(new Promise(done => { resolve = done; }));
  const pending = h.submit();
  h.state.selectedKbasesByScope["chat:chat"] = [{ id: "next", name: "Next" }];
  resolve({ capability: { available: true }, libraries: [library("lib-a"), library("LIB-A")] });
  await pending;
  expect(mockLoadKBaseOptions).toHaveBeenCalledWith("general");
  expect(mockStartQuery).toHaveBeenCalledWith(expect.objectContaining({ chatId: "chat", mustUseKbases: ["lib-a", "LIB-A"] }));
  expect(h.state.selectedKbasesByScope["chat:chat"]).toEqual([{ id: "next", name: "Next" }]);
});

it("rejects nine distinct libraries before fetching a directory or starting voice query", async () => {
  const h = harness(Array.from({ length: 9 }, (_, i) => `lib-${i}`));
  await h.submit();
  expect(mockLoadKBaseOptions).not.toHaveBeenCalled();
  expect(mockStartQuery).not.toHaveBeenCalled();
  expect(h.fatal).toHaveBeenCalledWith(expect.stringContaining("8"));
});

it("rejects a mixed readable/unreadable voice selection as a whole", async () => {
  const h = harness(["a", "b"]);
  mockLoadKBaseOptions.mockResolvedValue({ capability: { available: true }, libraries: [library("a"), library("b", false)] });
  await h.submit();
  expect(mockStartQuery).not.toHaveBeenCalled();
  expect(h.fatal).toHaveBeenCalled();
});

it("allows empty voice selection without checking a disabled capability", async () => {
  const h = harness(["", " "]);
  mockLoadKBaseOptions.mockRejectedValue(new Error("kbase.disabled"));
  await h.submit();
  expect(mockLoadKBaseOptions).not.toHaveBeenCalled();
  expect(mockStartQuery).toHaveBeenCalledWith(expect.objectContaining({ mustUseKbases: undefined }));
  expect(h.fatal).not.toHaveBeenCalled();
});
