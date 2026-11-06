/** @jest-environment jsdom */
import type { UserOutboxEntry } from "./userOutbox";
const draft: UserOutboxEntry = {scope: "alice", request: {requestId: "req-a", message: "hello", chatId: "chat-a"}, createdAt: 1};
let outbox: typeof import("./userOutbox");
beforeEach(() => { localStorage.clear(); jest.resetModules(); outbox = require("./userOutbox"); });
it("isolates identities and restores accepted drafts after refresh", () => {
  outbox.putUserOutbox(draft);
  outbox.acceptUserOutbox("alice", "req-a", {mailId: "m", chatId: "chat-a", delivery: "queued"});
  expect(outbox.readUserOutbox("bob")).toEqual([]);
  jest.resetModules(); outbox = require("./userOutbox");
  expect(outbox.readUserOutbox("alice")[0]).toMatchObject({mailId: "m", delivery: "queued", request: {message: "hello"}});
});
it("does not resurrect a bubble when consumption arrives before the receipt", () => {
  outbox.putUserOutbox(draft);
  outbox.consumeUserOutbox("alice", "req-a");
  outbox.acceptUserOutbox("alice", "req-a", {mailId: "m", chatId: "chat-a", delivery: "started"});
  outbox.putUserOutbox({...draft, mailId: "m"});
  expect(outbox.readUserOutbox("alice")).toEqual([]);
});
it("keeps failed drafts for local deletion or a new requestId", () => {
  outbox.putUserOutbox(draft);
  outbox.updateUserOutbox("alice", "req-a", {undelivered: true});
  const saved = outbox.readUserOutbox("alice")[0];
  outbox.putUserOutbox({...saved, request: {...saved.request, requestId: "new-id"}, undelivered: false});
  outbox.removeUserOutbox("alice", "req-a");
  expect(outbox.readUserOutbox("alice")).toEqual([expect.objectContaining({request: expect.objectContaining({requestId: "new-id"})})]);
});

it("clears a temporary undelivered state once a valid receipt arrives", () => {
  outbox.putUserOutbox({...draft, undelivered: true, error: "offline", newChat: true});
  outbox.acceptUserOutbox("alice", "req-a", {mailId: "accepted", chatId: "chat-a", delivery: "queued"});
  expect(outbox.readUserOutbox("alice")[0]).toMatchObject({undelivered: false, newChat: false, mailId: "accepted"});
  expect(outbox.readUserOutbox("alice")[0].error).toBeUndefined();
});
