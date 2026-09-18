/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { BtwProvider, useBTW } from "./BtwProvider";
import { createInitialState } from "@/app/state/state";
import { createSelectedTextFragment } from "@/features/selection/lib/selectedTextReference";
import type { RunIdentity } from "@/features/transport/contracts/realtimeTransport";

const mockRuns = { startBtw: jest.fn(), subscribe: jest.fn() };
const mockStateRef = { current: createInitialState() };
jest.mock("@/app/state/AppContext", () => ({
  useAppContext: () => ({ stateRef: mockStateRef, dispatch: jest.fn() }),
}));
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ useRunTransport: () => mockRuns }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it.each([true, false])("preserves unsent selections while the pending request is accepted=%s", async (accepted) => {
  localStorage.clear();
  mockStateRef.current = createInitialState();
  mockStateRef.current.chats = [{ chatId: "chat-a", agentKey: "agent-a" }];
  let resolveIdentity!: (identity: RunIdentity) => void;
  let rejectIdentity!: (error: Error) => void;
  const identity = new Promise<RunIdentity>((resolve, reject) => { resolveIdentity = resolve; rejectIdentity = reject; });
  mockRuns.startBtw.mockReturnValue({ identity, completion: Promise.resolve({ reason: "done", lastSeq: 1 }), detach: jest.fn() });
  let btw!: ReturnType<typeof useBTW>;
  const Harness = () => { btw = useBTW(); return null; };
  const root = createRoot(document.createElement("div"));
  const first = createSelectedTextFragment({ text: "first", targetId: "message-a", sourceKind: "message" })!;
  const later = createSelectedTextFragment({ text: "later", targetId: "message-b", sourceKind: "message" })!;
  try {
    act(() => root.render(React.createElement(BtwProvider, null, React.createElement(Harness))));
    act(() => { btw.addDraftSelection("chat-a", first); });
    act(() => { btw.updateDraftAnnotation("chat-a", first.reference.id, "rewrite this"); });
    const annotated = { ...first, reference: { ...first.reference, annotation: "rewrite this" } };
    let sending!: Promise<boolean>;
    act(() => { sending = btw.sendBTW("chat-a", "explain"); });
    act(() => { btw.addDraftSelection("chat-a", later); });
    expect(mockRuns.startBtw).toHaveBeenLastCalledWith(expect.objectContaining({ references: [annotated.reference] }));
    await act(async () => {
      if (accepted) resolveIdentity({ requestId: "req-a", chatId: "chat-a", runId: "run-a", owner: { kind: "agent", agentKey: "agent-a" } });
      else rejectIdentity(new Error("not accepted"));
      await sending;
    });
    expect(btw.getSession("chat-a")?.draftSelections).toEqual(accepted ? [later] : [annotated, later]);
  } finally {
    act(() => root.unmount());
    localStorage.clear();
  }
});
