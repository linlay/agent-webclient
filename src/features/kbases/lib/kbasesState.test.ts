/** @jest-environment jsdom */
import {appReducer} from "@/app/state/reducer";
import {createInitialState} from "@/app/state/state";
import {initializeChatKbases, kbaseSelectionScope} from "./kbasesState";
const a = [{id: "lib-a", name: "A"}];
const b = [{id: "lib-b", name: "B"}];
it("isolates blank Agent drafts, promotes to a Chat and preserves next-query choices across chats", () => {
 let state = createInitialState();
 state = appReducer(state, {type: "SET_SELECTED_KBASES", scope: kbaseSelectionScope("", "one"), libraries: a});
 expect(state.selectedKbasesByScope[kbaseSelectionScope("", "two")]).toBeUndefined();
 state = appReducer(state, {type: "PROMOTE_KBASE_SELECTION", scope: "new:one", chatId: "chat-a"});
 expect(state.selectedKbasesByScope["chat:chat-a"]).toEqual(a);
 expect(state.selectedKbasesByScope["new:one"]).toBeUndefined();
 state = appReducer(state, {type: "SET_CHAT_ID", chatId: "chat-b"});
 state = appReducer(state, {type: "SET_SELECTED_KBASES", scope: "chat:chat-b", libraries: b});
 state = appReducer(state, {type: "SET_CHAT_ID", chatId: "chat-a"});
 expect(state.selectedKbasesByScope["chat:chat-a"]).toEqual(a);
 state = appReducer(state, {type: "SET_SELECTED_KBASES", scope: "new:one", libraries: b});
 state = appReducer(state, {type: "RESET_ACTIVE_CONVERSATION"});
 expect(state.selectedKbasesByScope["new:one"]).toBeUndefined();
 expect(state.selectedKbasesByScope["chat:chat-a"]).toEqual(a);
});
it("captures an immutable submission and never replaces a later selection on failure", () => {
 let state = appReducer(createInitialState(), {type: "SET_SELECTED_KBASES", scope: "new:one", libraries: a});
 const input = {requestId: "request", chatId: "", agentKey: "one", message: "hello", references: [], skills: [], kbaseScope: "new:one", kbases: a.map(item => ({...item}))};
 state = appReducer(state, {type: "BEGIN_COMPOSER_SUBMISSION", draft: input});
 input.kbases[0].name = "mutated";
 expect(state.submissionDrafts.request.kbases?.[0].name).toBe("A");
 state = appReducer(state, {type: "SET_SELECTED_KBASES", scope: "new:one", libraries: b});
 state = appReducer(state, {type: "SETTLE_COMPOSER_SUBMISSION", requestId: "request", accepted: false});
 expect(state.selectedKbasesByScope["new:one"]).toEqual(b);
 expect(state.failedSubmissions[0].kbases).toEqual(a);
});
it("cold replay restores the last main query but honors an explicit cleared selection", () => {
 const events = [{type: "request.query", chatId: "chat", mustUseKbases: ["a"]},
  {type: "request.query", chatId: "chat", query: {mustUseKbases: ["a", "b"]}},
  {type: "request.query", chatId: "chat", taskId: "child", mustUseKbases: ["child"]}] as never;
 const restored = initializeChatKbases({selectedKbasesByScope: {}}, "chat", events);
 expect(restored.selectedKbasesByScope["chat:chat"].map(item => item.id)).toEqual(["a", "b"]);
 expect(initializeChatKbases({selectedKbasesByScope: {"chat:chat": []}}, "chat", events).selectedKbasesByScope["chat:chat"]).toEqual([]);
});
