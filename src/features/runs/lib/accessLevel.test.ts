import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { mergeRunAccessLevel, readRunAccessLevelEvent, resolveRunAccessLevel } from "./accessLevel";

const query = (runId: string, accessLevel?: string): AgentEvent => ({
  type: "request.query", chatId: "chat", runId, accessLevel,
});
const changed = (version: number, accessLevel: string): AgentEvent => ({
  type: "run.access_level.changed", chatId: "chat", runId: "run", version, accessLevel,
});

it("restores the latest root Run's inherited permission without falling back to older Runs", () => {
  expect(resolveRunAccessLevel({ chatId: "chat", events: [query("old", "default"), query("run", "auto_approve")] }))
    .toEqual({ runId: "run", accessLevel: "auto_approve", version: 1 });
  expect(resolveRunAccessLevel({ chatId: "chat", events: [query("old", "full_access"), query("run")] })).toBeUndefined();
  expect(resolveRunAccessLevel({ chatId: "chat", runId: "missing", events: [query("old", "full_access")] })).toBeUndefined();
});

it("uses the latest permission version when changes or bootstrap events arrive out of order", () => {
  expect(resolveRunAccessLevel({ chatId: "chat", events: [
    query("run", "default"), changed(3, "auto_approve"), changed(2, "full_access"), query("run", "default"),
  ] })).toEqual({ runId: "run", accessLevel: "auto_approve", version: 3 });
  const current = { runId: "run", accessLevel: "full_access" as const, version: 2 };
  expect(mergeRunAccessLevel(current, { ...current, accessLevel: "default", version: 1 })).toBe(current);
  expect(mergeRunAccessLevel(current, { runId: "next", accessLevel: "default", version: 1 }).accessLevel).toBe("default");
});

it("prefers a current active Run snapshot over its older query", () => {
  expect(resolveRunAccessLevel({ chatId: "chat", events: [query("run", "default"), changed(2, "auto_approve")],
    activeRun: { runId: "run", accessLevel: "full_access", accessLevelVersion: 3 },
  })).toEqual({ runId: "run", accessLevel: "full_access", version: 3 });
});

it("ignores other Chats, child tasks and side conversations", () => {
  const ignored = [
    { chatId: "another" }, { taskId: "task" }, { subAgentKey: "child" },
    { btwId: "btw" }, { lane: "btw" }, { kind: "explain" },
  ].map(fields => ({ ...query("child", "full_access"), ...fields }));
  expect(resolveRunAccessLevel({ chatId: "chat", events: [query("run", "auto_approve"), ...ignored] }))
    .toEqual({ runId: "run", accessLevel: "auto_approve", version: 1 });
});

it("reads saved query payloads and rejects invalid permissions or change versions", () => {
  expect(readRunAccessLevelEvent({ ...query("run"), query: { accessLevel: "full_access" } })?.accessLevel).toBe("full_access");
  expect(readRunAccessLevelEvent(query("run", "admin"))).toBeUndefined();
  expect(readRunAccessLevelEvent(query("run"))).toBeUndefined();
  expect(readRunAccessLevelEvent({ ...changed(2, "full_access"), version: undefined })).toBeUndefined();
  expect(readRunAccessLevelEvent({ ...changed(2, "full_access"), version: 0 })).toBeUndefined();
});
