/** @jest-environment jsdom */
import React, {act} from "react";
import { createRoot, type Root } from "react-dom/client";
const roots: Root[] = [];
Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
afterEach(() => act(() => roots.splice(0).forEach(root => root.unmount())));
import { useMessageActions } from "./useMessageActions";
import { createInitialState } from "@/app/state/state";
import { appReducer } from "@/app/state/reducer";
import { readUserOutbox, consumeUserOutbox } from "@/features/mailbox/lib/userOutbox";
import { resolveStorageIdentity } from "@/shared/data/auth/storageIdentity";
const mockSend = jest.fn();
const mockQuery = jest.fn();
let mockContext: Record<string, unknown>;
jest.mock("@/shared/data/api/routedClient", () => ({...jest.requireActual("@/shared/data/api/routedClient"), sendUserMessage: (...args: unknown[]) => mockSend(...args)}));
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({useRunTransport: () => ({startQuery: mockQuery})}));
jest.mock("@/app/state/AppContext", () => ({useAppContext: () => mockContext}));
// Only BOT Chats send through /api/send; other modes keep query/steer.
function setup(mode = "BOT") {
  const state = createInitialState();
  state.chatId = "chat-a";
  state.chats = [{chatId: "chat-a", agentKey: "agent-a", lastRunId: "run-a"}];
  state.agents = [{key: "agent-a", name: "Agent", mode}];
  state.currentAgent = {key: "agent-a", name: "Agent", mode};
  state.currentChatActiveRun = {chatId: "chat-a", runId: "run-a", agentKey: "agent-a"};
  state.streaming = true;
  const stateRef = {current: state};
  const dispatch = jest.fn(action => {stateRef.current = appReducer(stateRef.current, action);});
  mockContext = {state, stateRef, dispatch, querySessionsRef: {current: new Map()}, activeQuerySessionRequestIdRef: {current: ""}, chatQuerySessionIndexRef: {current: new Map()}};
  let actions: ReturnType<typeof useMessageActions>;
  function Harness() { actions = useMessageActions({onAgentEvent: jest.fn()}); return null; }
  const root = createRoot(document.createElement("div")); roots.push(root);
  act(() => root.render(<Harness />));
  return {stateRef, dispatch, actions: actions!, scope: resolveStorageIdentity(state.accessToken)};
}
beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); });
it("sends text to an active BOT Chat without starting a Query stream", async () => {
  mockSend.mockResolvedValue({data: {mailId: "m-one", chatId: "chat-a", delivery: "inserted", runId: "run-a", ignoredOptions: ["model"]}});
  const h = setup();
  await h.actions.sendMessage("next input", [], [], {}, "full_access", {key: "new-model"}, "chat-a", "agent-a", true, "", "req-one");
  // Platform decides the Run's detail level; the send carries none.
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({requestId: "req-one", message: "next input", model: {key: "new-model"}, editingMode: true}));
  expect(mockQuery).not.toHaveBeenCalled();
  expect(readUserOutbox(h.scope)).toContainEqual(expect.objectContaining({mailId: "m-one", delivery: "inserted"}));
  expect(h.stateRef.current.timelineNodes.has("user_req-one")).toBe(false);
  consumeUserOutbox(h.scope, "req-one");
});
it("marks a receipt that failed on the spot as undelivered without attaching its Run", async () => {
  mockSend.mockResolvedValue({data: {mailId: "m-failed", chatId: "chat-a", delivery: "started", runId: "run-never", status: "failed", error: {code: "mail_delivery_failed", message: "interactionConfig.model is disabled"}}});
  const attach = jest.fn();
  window.addEventListener("agent:attach-run", attach);
  try {
    const h = setup();
    h.stateRef.current = {...h.stateRef.current, streaming: false, currentChatActiveRun: null};
    await h.actions.sendMessage("will fail", [], [], {}, undefined, undefined, "chat-a", "agent-a", false, "", "req-failed");
    expect(attach).not.toHaveBeenCalled();
    expect(readUserOutbox(h.scope)).toContainEqual(expect.objectContaining({mailId: "m-failed", undelivered: true, error: "interactionConfig.model is disabled"}));
    consumeUserOutbox(h.scope, "req-failed");
  } finally { window.removeEventListener("agent:attach-run", attach); }
});
it("sends references without text through the mailbox", async () => {
  mockSend.mockResolvedValue({data: {mailId: "m-refs", chatId: "chat-a", delivery: "inserted", runId: "run-a"}});
  const h = setup();
  const file = {type: "file", name: "notes.txt", url: "@chat/notes.txt"};
  await h.actions.sendMessage("", [file], [], {}, undefined, undefined, "chat-a", "agent-a", false, "", "req-refs");
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({requestId: "req-refs", message: "", references: [expect.objectContaining({url: "@chat/notes.txt"})]}));
  expect(mockQuery).not.toHaveBeenCalled();
  consumeUserOutbox(h.scope, "req-refs");
});
it("keeps an acceptance failure as a recoverable local draft", async () => {
  mockSend.mockRejectedValue(new Error("connection lost"));
  const h = setup();
  await h.actions.sendMessage("keep this text", [], [], {}, undefined, undefined, "chat-a", "agent-a", false, "", "req-failure");
  expect(readUserOutbox(h.scope)).toContainEqual(expect.objectContaining({uncertain: true, undelivered: false, error: "connection lost", request: expect.objectContaining({message: "keep this text"})}));
  consumeUserOutbox(h.scope, "req-failure");
});

it.each(["GENERAL", "CODER", "KBASE", "TEAM", "EXECUTOR"])("keeps the Query path for a %s Agent", async agentMode => {
  mockQuery.mockReturnValue({
    identity: Promise.resolve({chatId: "chat-a", runId: "query-run", owner: {kind: "agent", agentKey: "agent-a"}}),
    completion: Promise.resolve({reason: "done", lastSeq: 1}),
    detach: jest.fn(),
  });
  const h = setup(agentMode);
  h.stateRef.current = {...h.stateRef.current, streaming: false, currentChatActiveRun: null};
  await h.actions.sendMessage("idle input", [], [], {}, undefined, undefined, "chat-a", "agent-a", false, "", "req-query");
  expect(mockSend).not.toHaveBeenCalled();
  expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({message: "idle input", requestId: "req-query"}));
  expect(readUserOutbox(h.scope)).toEqual([]);
  // A running Chat is steered by the composer; a stray send does not open another Run.
  mockQuery.mockClear();
  const busy = setup(agentMode);
  await busy.actions.sendMessage("busy input", [], [], {}, undefined, undefined, "chat-a", "agent-a", false, "", "req-busy");
  expect(mockSend).not.toHaveBeenCalled();
  expect(mockQuery).not.toHaveBeenCalled();
});

it("preserves the legacy Query path for Gateway deployments without send support", async () => {
  const backend = require("@/shared/config/backendMode") as typeof import("@/shared/config/backendMode");
  const mode = jest.spyOn(backend, "getBackendMode").mockReturnValue("gateway");
  mockQuery.mockReturnValue({
    identity: Promise.resolve({chatId: "chat-a", runId: "gateway-run", owner: {kind: "agent", agentKey: "agent-a"}}),
    completion: Promise.resolve({reason: "done", lastSeq: 1}),
    detach: jest.fn(),
  });
  try {
    const h = setup();
    h.stateRef.current = {...h.stateRef.current, streaming: false, currentChatActiveRun: null};
    await h.actions.sendMessage("gateway input");
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({message: "gateway input"}));
  } finally { mode.mockRestore(); }
});

it.each([false, true])("routes a first BOT message through Platform with staged files=%s", async files => {
  mockSend.mockResolvedValue({data: {mailId: "bot-letter", chatId: "bot-main", delivery: "queued"}});
  const h = setup();
  h.stateRef.current = {...h.stateRef.current, streaming: false, currentChatActiveRun: null, chatId: "", chats: [],
    currentAgent: {key:"bot", name:"Bot", mode:"BOT"}, agents: [{key:"bot", name:"Bot", mode:"BOT"}], workerSelectionKey:"agent:bot", planningMode:true};
  const refs = files ? [{type:"file",url:"@chat/note.txt",name:"note.txt"}] : [];
  await h.actions.sendMessage("hello bot", refs, [], {}, undefined, {key:"ignored"}, files ? "staged-chat" : "", "bot", false, "", "req-bot");
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({agentKey:"bot",chatId:files ? "staged-chat" : undefined,model:undefined}));
  expect(mockSend.mock.calls[0][0].planningMode).toBeUndefined();
  expect(mockSend.mock.calls[0][0].primary).toBeUndefined();
  expect(mockQuery).not.toHaveBeenCalled();
});
