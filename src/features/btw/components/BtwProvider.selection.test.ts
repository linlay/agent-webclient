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
    const annotated = { ...first, reference: { ...first.reference, annotation: "rewrite this", annotationIndex: 1 } };
    let sending!: Promise<boolean>;
    act(() => { sending = btw.sendBTW("chat-a", "explain"); });
    act(() => { btw.addDraftSelection("chat-a", later); });
    expect(mockRuns.startBtw).toHaveBeenLastCalledWith(expect.objectContaining({ references: [annotated.reference] }));
    await act(async () => {
      if (accepted) resolveIdentity({ requestId: "req-a", chatId: "chat-a", runId: "run-a", owner: { kind: "agent", agentKey: "agent-a" } });
      else rejectIdentity(new Error("not accepted"));
      await sending;
    });
    const numberedLater = { ...later, reference: { ...later.reference, annotationIndex: 2 } };
    expect(btw.getSession("chat-a")?.draftSelections).toEqual(accepted ? [numberedLater] : [annotated, numberedLater]);
    if (accepted) {
      act(() => mockRuns.startBtw.mock.calls.at(-1)![0].onEvent({ type: "run.complete", chatId: "chat-a", runId: "run-a" }));
      expect(btw.getSession("chat-a")?.draftSelections[0].reference.annotationIndex).toBe(1);
      act(() => btw.removeDraftSelection("chat-a", later.reference.id));
      act(() => mockRuns.startBtw.mock.calls.at(-1)![0].onEvent({ type: "run.complete", chatId: "chat-a", runId: "run-b" }));
      act(() => btw.addDraftSelection("chat-a", first));
      expect(btw.getSession("chat-a")?.draftSelections[0].reference.annotationIndex).toBe(1);
    }
  } finally {
    act(() => root.unmount());
    localStorage.clear();
  }
});

it("keeps separate counters for side chats and renumbers drafts after a deletion", () => {
  localStorage.clear(); mockStateRef.current = createInitialState();
  let btw!: ReturnType<typeof useBTW>;
  const Harness = () => { btw = useBTW(); return null; };
  const root = createRoot(document.createElement("div"));
  const add = (chat:string,text:string) => act(() => { btw.addDraftSelection(chat,createSelectedTextFragment({text,targetId:text,sourceKind:"message"})!); });
  try {
    act(() => root.render(React.createElement(BtwProvider,null,React.createElement(Harness))));
    add("chat-a","one"); add("chat-a","two"); add("chat-b","three");
    expect(btw.getSession("chat-a")?.draftSelections.map(f=>f.reference.annotationIndex)).toEqual([1,2]);
    expect(btw.getSession("chat-b")?.draftSelections.map(f=>f.reference.annotationIndex)).toEqual([1]);
    const selections = btw.getSession("chat-a")!.draftSelections;
    act(()=>btw.removeDraftSelection("chat-a",selections[0].reference.id));
    expect(btw.getSession("chat-a")?.draftSelections.map(f=>f.reference.annotationIndex)).toEqual([1]);
    act(()=>btw.removeDraftSelection("chat-a",selections[1].reference.id));
    add("chat-a","four");
    expect(btw.getSession("chat-a")?.draftSelections[0].reference.annotationIndex).toBe(1);
  } finally { act(()=>root.unmount()); localStorage.clear(); }
});
