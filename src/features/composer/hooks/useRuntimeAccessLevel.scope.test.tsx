/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useRuntimeAccessLevel } from "./useRuntimeAccessLevel";
import { readComposerAccessLevel, updateComposerAccessLevel, type ComposerAccessState } from "../lib/composerAccessLevel";
import type { QueryAccessLevel } from "@/shared/data";

const mockUpdate = jest.fn();
const mockRuns = { updateAccessLevel: mockUpdate };
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ useRunTransport: () => mockRuns }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("rolls back the original Chat after navigation, and ignores older requests in the same Chat", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const rejections: Array<() => void> = [];
  mockUpdate.mockImplementation(() => new Promise(resolve => rejections.push(() => resolve({ data: { accepted: false } }))));
  let state: ComposerAccessState = { accessLevelByChatId: {}, newChatAccessLevelByAgentKey: {} };
  let change!: (value: QueryAccessLevel) => void;
  const address = (chatId: string) => ({ scope: "user", chatId, agentKey: "agent" });
  function Harness({ chatId }: { chatId: string }) {
    const target = address(chatId);
    change = useRuntimeAccessLevel({
      accessScopeKey: chatId,
      accessLevel: readComposerAccessLevel(state, target),
      activeRunId: `run-${chatId}`, activeRunOwner: { kind: "agent", agentKey: "agent" },
      isRunActive: true,
      setAccessLevel: value => { state = updateComposerAccessLevel(state, target, value); },
      messageApi: { warning: jest.fn(), error: jest.fn() }, t: key => key,
    });
    return null;
  }
  const show = (chatId: string) => act(() => root.render(<Harness chatId={chatId} />));
  try {
    show("a");
    act(() => change("full_access"));
    show("b");
    act(() => change("auto_approve"));
    await act(async () => rejections[0]());
    expect(readComposerAccessLevel(state, address("a"))).toBe("default");
    expect(readComposerAccessLevel(state, address("b"))).toBe("auto_approve");
    show("a");
    act(() => change("auto_approve"));
    show("a");
    act(() => change("full_access"));
    await act(async () => rejections[2]());
    expect(readComposerAccessLevel(state, address("a"))).toBe("full_access");
    await act(async () => rejections[3]());
    expect(readComposerAccessLevel(state, address("a"))).toBe("auto_approve");
  } finally {
    act(() => root.unmount());
  }
});
