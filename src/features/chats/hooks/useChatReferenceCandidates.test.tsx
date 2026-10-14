/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getChats, searchGlobal, type GlobalSearchResult } from "@/shared/data";
import { useChatReferenceCandidates } from "./useChatReferenceCandidates";

jest.mock("@/shared/data", () => ({ getChats: jest.fn(), searchGlobal: jest.fn() }));

type Options = Parameters<typeof useChatReferenceCandidates>[0];
const listResponse = (data: unknown[]) => ({ status: 200, code: 0, msg: "", data });
const searchResponse = (results: GlobalSearchResult[]) => ({
  status: 200, code: 0, msg: "", data: { query: "needle", count: results.length, results },
});
const hit = (chatId: string, chatName = chatId): GlobalSearchResult => ({
  chatId, chatName, kind: "message", timestamp: 1, snippet: "needle in the body", score: 1,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

let root: Root;
let options: Options;
let current: ReturnType<typeof useChatReferenceCandidates>;
function Harness(props: Options) {
  current = useChatReferenceCandidates(props);
  return null;
}
async function render(patch: Partial<Options> = {}) {
  options = { ...options, ...patch };
  await act(async () => root.render(<Harness {...options} />));
}
async function advance(milliseconds = 250) {
  await act(async () => jest.advanceTimersByTime(milliseconds));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  jest.mocked(getChats).mockReset().mockResolvedValue(listResponse([{ chatId: "recent", chatName: "Recent" }]));
  jest.mocked(searchGlobal).mockReset().mockResolvedValue(searchResponse([hit("older", "Unrelated title")]));
  options = { enabled: true, agentKey: "alpha", currentChatId: "current", query: "" };
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  jest.useRealTimers();
});

it("loads only 25 summaries on opening and displays 24 other chats in server order", async () => {
  await render({ enabled: false });
  expect(getChats).not.toHaveBeenCalled();
  jest.mocked(getChats).mockResolvedValue(listResponse([
    { chatId: "current" },
    ...Array.from({ length: 30 }, (_, index) => ({ chatId: `chat-${index}` })),
  ]));
  await render({ enabled: true });
  expect(getChats).toHaveBeenCalledWith({ agentKey: "alpha", limit: 25 });
  expect(searchGlobal).not.toHaveBeenCalled();
  expect(current.chats.map(chat => chat.chatId)).toEqual(Array.from({ length: 24 }, (_, index) => `chat-${index}`));
  expect(current.loading).toBe(false);
});

it("searches remotely after a debounce and keeps body matches with unrelated titles", async () => {
  await render();
  jest.mocked(searchGlobal).mockResolvedValue(searchResponse([
    hit("current"), hit("older", "Unrelated title"), hit("older"), hit("another"), hit(""),
  ]));
  await render({ query: "  needle  " });
  expect(current.chats).toEqual([]);
  expect(current.loading).toBe(true);
  await advance(249);
  expect(searchGlobal).not.toHaveBeenCalled();
  await advance(1);
  expect(searchGlobal).toHaveBeenCalledWith({ agentKey: "alpha", query: "needle", limit: 75 });
  expect(getChats).toHaveBeenCalledTimes(1);
  expect(current.chats).toEqual([
    { chatId: "older", chatName: "Unrelated title" }, { chatId: "another", chatName: "another" },
  ]);
});

it("coalesces typing and ignores a late response for an earlier keyword", async () => {
  await render();
  await render({ query: "n" });
  await advance(100);
  await render({ query: "ne" });
  await advance(100);
  expect(searchGlobal).not.toHaveBeenCalled();
  const old = deferred<ReturnType<typeof searchResponse>>();
  jest.mocked(searchGlobal).mockImplementationOnce(() => old.promise);
  await render({ query: "needle" });
  await advance();
  await render({ query: "new" });
  jest.mocked(searchGlobal).mockResolvedValueOnce(searchResponse([hit("latest")]));
  await advance();
  await act(async () => old.resolve(searchResponse([hit("stale")])));
  expect(current.chats.map(chat => chat.chatId)).toEqual(["latest"]);
  expect(searchGlobal).toHaveBeenCalledTimes(2);
});

it("restores the preview without fetching again when search is cleared", async () => {
  await render();
  const pending = deferred<ReturnType<typeof searchResponse>>();
  jest.mocked(searchGlobal).mockImplementationOnce(() => pending.promise);
  await render({ query: "needle" });
  await advance();
  await render({ query: "   " });
  expect(current.chats.map(chat => chat.chatId)).toEqual(["recent"]);
  expect(current.loading).toBe(false);
  expect(getChats).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(searchResponse([hit("stale")])));
  expect(current.chats.map(chat => chat.chatId)).toEqual(["recent"]);
});

it("does not query incomplete IME input, and searches after composition ends", async () => {
  await render();
  await render({ composing: true, query: "n" });
  await advance(1000);
  await render({ composing: true, query: "你好" });
  await advance(1000);
  expect(searchGlobal).not.toHaveBeenCalled();
  await render({ composing: false });
  await advance();
  expect(searchGlobal).toHaveBeenCalledWith({ agentKey: "alpha", query: "你好", limit: 75 });
});

it("isolates previews and pending requests when the Agent or current Chat changes", async () => {
  const old = deferred<ReturnType<typeof listResponse>>();
  jest.mocked(getChats).mockImplementationOnce(() => old.promise);
  await render();
  jest.mocked(getChats).mockResolvedValueOnce(listResponse([{ chatId: "beta-chat" }]));
  await render({ agentKey: "beta" });
  await act(async () => old.resolve(listResponse([{ chatId: "alpha-chat" }])));
  expect(current.chats.map(chat => chat.chatId)).toEqual(["beta-chat"]);
  jest.mocked(getChats).mockResolvedValueOnce(listResponse([{ chatId: "beta-chat" }, { chatId: "current" }]));
  await render({ currentChatId: "beta-chat" });
  expect(current.chats.map(chat => chat.chatId)).toEqual(["current"]);
});

it("ignores a pending request after closing and reloads the next opening", async () => {
  const old = deferred<ReturnType<typeof listResponse>>();
  jest.mocked(getChats).mockImplementationOnce(() => old.promise);
  await render();
  await render({ enabled: false });
  await act(async () => old.resolve(listResponse([{ chatId: "stale" }])));
  expect(current.chats).toEqual([]);
  await render({ enabled: true });
  expect(current.chats.map(chat => chat.chatId)).toEqual(["recent"]);
  expect(getChats).toHaveBeenCalledTimes(2);
});

it("distinguishes a failed preview from an empty response and supports retry", async () => {
  jest.mocked(getChats).mockRejectedValueOnce(new Error("offline"));
  await render();
  expect(current.error).toBe(true);
  expect(current.loading).toBe(false);
  await act(async () => current.retry());
  expect(current.error).toBe(false);
  expect(current.chats.map(chat => chat.chatId)).toEqual(["recent"]);
  expect(getChats).toHaveBeenCalledTimes(2);
});

it("retries search through the search endpoint and preserves the default preview", async () => {
  await render();
  jest.mocked(searchGlobal).mockRejectedValueOnce(new Error("offline"));
  await render({ query: "needle" });
  await advance();
  expect(current.error).toBe(true);
  await act(async () => current.retry());
  await advance();
  expect(current.error).toBe(false);
  expect(current.chats.map(chat => chat.chatId)).toEqual(["older"]);
  expect(searchGlobal).toHaveBeenCalledTimes(2);
  await render({ query: "" });
  expect(current.chats.map(chat => chat.chatId)).toEqual(["recent"]);
  expect(getChats).toHaveBeenCalledTimes(1);
});
