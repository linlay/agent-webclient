import { awaitingViewFrame, acceptsViewSubmit, wrapViewFrameSubmit } from "@/features/tools/lib/viewFrame";
import type { FormActiveAwaiting } from "@/features/tools/lib/toolsState";
const data = { view: { source: "connector", connectorId: "member", key: "edit", hash: "a".repeat(64), renderer: "html" },
  key: "root:wait", runId: "root", awaitingId: "task:wait", mode: "form", forms: [{ id: "task:wait", form: { name: "old" } }] } as unknown as FormActiveAwaiting;
test("a member form is framed as-is and its submit keeps the host routing", () => {
  const frame = awaitingViewFrame(data, 0);
  expect(frame.awaiting).toBe(data);
  const wrapped = wrapViewFrameSubmit(data, frame, { runId: "ignored", awaitingId: "ignored", params: [{ id: "task:wait", decision: "approve", form: { name: "new" } }] });
  expect(wrapped).toEqual({ runId: "root", awaitingId: "task:wait", params: [{ id: "task:wait", decision: "approve", form: { name: "new" } }] });
  expect(wrapViewFrameSubmit(data, frame, { runId: "root", awaitingId: "task:wait", params: [{ id: "other", decision: "reject" }] })).toBeNull();
});
test("unsolicited and stale VIEW submit messages cannot approve", () => {
  expect(acceptsViewSubmit(false, "one", "one")).toBe(false);
  expect(acceptsViewSubmit(true, "old", "new")).toBe(false);
  expect(acceptsViewSubmit(true, "one", "one")).toBe(true);
});
