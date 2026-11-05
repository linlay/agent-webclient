/** @jest-environment jsdom */
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import {OpenedChats, needsOpenedChatAttention} from "./OpenedChats";
import {getOpenedChats} from "@/shared/data/api/requests/chats";
import type {ApiResponse} from "@/shared/data/api/dto/common";
import type {ChatSummaryResponse} from "@/shared/data/api/dto/chats";
jest.mock("@/shared/data/api/requests/chats", () => ({getOpenedChats: jest.fn()}));
jest.mock("@/shared/i18n", () => ({useI18n: () => ({t: (key: string) => key})}));
const load = jest.mocked(getOpenedChats);
const response: ApiResponse<ChatSummaryResponse[]> = {status: 200, code: 0, msg: "", data: [
  {chatId: "work", chatName: "task", awaiting: {mode: "wait"}, activeRun: {runId: "r"}},
]};

it("ordinary wait is running, while questions require attention", () => {
  expect(needsOpenedChatAttention(response.data[0])).toBe(false);
  expect(needsOpenedChatAttention({chatId: "c", awaiting: {mode: "question"}})).toBe(true);
});

it("refreshes only relevant events and never polls", async () => {
  jest.useFakeTimers();
  load.mockResolvedValue(response);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<OpenedChats agentKey="lead" onSelectChat={() => {}} />));
  expect(host.textContent).toContain("leftSidebar.navigation.primaryRunning");
  expect(host.textContent).not.toContain("leftSidebar.navigation.primaryAwaiting");
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => {
    window.dispatchEvent(new CustomEvent("agent:mail-updated", {detail: {mailId: "other", toAgentKey: "other"}}));
    jest.advanceTimersByTime(30000);
  });
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => {
    window.dispatchEvent(new CustomEvent("agent:mail-updated", {detail: {mailId: "new", fromAgentKey: "lead"}}));
    window.dispatchEvent(new CustomEvent("agent:mail-updated", {detail: {mailId: "new", fromAgentKey: "lead"}}));
    jest.advanceTimersByTime(100);
  });
  expect(load).toHaveBeenCalledTimes(2);
  await act(async () => root.unmount());
  host.remove();
  jest.useRealTimers();
});
