/** @jest-environment jsdom */
import { createInitialState } from "@/app/state/state";
import { appReducer } from "@/app/state/reducer";
import {
  readComposerAccessLevel, updateComposerAccessLevel,
  persistComposerAccessLevels, restoreComposerAccessLevels,
  resolveComposerAccessScope, type ComposerAccessTarget,
} from "./composerAccessLevel";

const target = (chatId = "", agentKey = "agent-a", scope = "user-a"): ComposerAccessTarget => ({ scope, chatId, agentKey });
beforeEach(() => sessionStorage.clear());

it("isolates new Chat preferences by Agent, and existing Chats from each other and new Chat", () => {
  let state = createInitialState();
  const set = (address: ComposerAccessTarget, value: "default" | "auto_approve" | "full_access", initializeOnly = false) => {
    state = appReducer(state, { type: "SET_COMPOSER_ACCESS_LEVEL", target: address, value, initializeOnly });
  };
  set(target(), "auto_approve");
  set(target("", "agent-b"), "full_access");
  set(target("chat-1"), "auto_approve", true);
  set(target("chat-1"), "full_access");
  state = appReducer(state, { type: "SET_CHAT_ID", chatId: "chat-2" });
  expect(readComposerAccessLevel(state, target("chat-2"))).toBe("default");
  state = appReducer(state, { type: "RESET_ACTIVE_CONVERSATION" });
  state = appReducer(state, { type: "SET_CHAT_ID", chatId: "chat-1" });
  expect(readComposerAccessLevel(state, target("chat-1"))).toBe("full_access");
  expect(readComposerAccessLevel(state, target())).toBe("auto_approve");
  expect(readComposerAccessLevel(state, target("", "agent-b"))).toBe("full_access");
  expect(readComposerAccessLevel(state, target("chat-1", "agent-a", "user-b"))).toBe("default");
});

it("initializes accepted Chat only once so repeated identity events cannot overwrite a newer choice", () => {
  let state = restoreComposerAccessLevels();
  state = updateComposerAccessLevel(state, target("chat-1"), "auto_approve", true);
  state = updateComposerAccessLevel(state, target("chat-1"), "default");
  state = updateComposerAccessLevel(state, target("chat-1"), "auto_approve", true);
  expect(readComposerAccessLevel(state, target("chat-1"))).toBe("default");
});

it("restores both scopes on reload, without sharing identities", () => {
  let state = restoreComposerAccessLevels();
  state = updateComposerAccessLevel(state, target(), "auto_approve");
  state = updateComposerAccessLevel(state, target("chat-1"), "full_access");
  persistComposerAccessLevels(state);
  const restored = createInitialState();
  expect(readComposerAccessLevel(restored, target())).toBe("auto_approve");
  expect(readComposerAccessLevel(restored, target("chat-1"))).toBe("full_access");
  expect(readComposerAccessLevel(restored, target("", "agent-a", "user-b"))).toBe("default");
});

it("ignores invalid persisted permissions and tolerates unavailable storage", () => {
  sessionStorage.setItem("agent-webclient.composer-access.v1", JSON.stringify({ accessLevelByChatId: { bad: "admin" } }));
  expect(restoreComposerAccessLevels().accessLevelByChatId).toEqual({});
  const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(restoreComposerAccessLevels()).toEqual({ accessLevelByChatId: {}, newChatAccessLevelByAgentKey: {} });
  spy.mockRestore();
});

it("separates standalone credentials without putting their text into persisted keys", () => {
  expect(resolveComposerAccessScope("credential-a")).not.toBe(resolveComposerAccessScope("credential-b"));
  expect(resolveComposerAccessScope("credential-a")).not.toContain("credential-a");
});
