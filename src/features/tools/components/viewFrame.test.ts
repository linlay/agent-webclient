import { awaitingViewFrame, acceptsViewSubmit, wrapViewFrameSubmit } from "./viewFrame";
import type { FormActiveAwaiting } from "@/features/tools/lib/toolsState";
const ref = { connectorId: "member", key: "edit", hash: "a".repeat(64), renderer: "html" };
const data = { key: "root:wait", runId: "root", awaitingId: "wait", mode: "form", forms: [
  { id: "child:wait", form: { mode: "form", awaitingId: "child-wait", view: ref, forms: [{ id: "name", form: { name: "old" } }] } },
  { id: "other:wait", form: { secret: "other member" } },
] } as unknown as FormActiveAwaiting;
test("Team VIEW sees only its member and host wraps the response", () => {
  const frame = awaitingViewFrame(data, 0);
  expect(JSON.stringify(frame.awaiting)).not.toContain("other member");
  expect(frame.awaiting.view).toEqual(ref);
  const wrapped = wrapViewFrameSubmit(data, frame, { runId: "ignored", awaitingId: "ignored", params: [{ id: "name", decision: "approve", form: { name: "new" } }] });
  expect(wrapped).toMatchObject({ runId: "root", awaitingId: "wait", params: [{ id: "child:wait", form: { params: [{ id: "name", form: { name: "new" } }] } }] });
  expect(wrapViewFrameSubmit(data, frame, { runId: "root", awaitingId: "wait", params: [{ id: "other:wait", decision: "reject" }] })).toBeNull();
});
test("unsolicited and stale VIEW submit messages cannot approve", () => {
  expect(acceptsViewSubmit(false, "one", "one")).toBe(false);
  expect(acceptsViewSubmit(true, "old", "new")).toBe(false);
  expect(acceptsViewSubmit(true, "one", "one")).toBe(true);
});
