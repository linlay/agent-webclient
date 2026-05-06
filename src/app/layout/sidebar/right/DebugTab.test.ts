import type { AgentEvent } from "@/app/state/types";
import { buildDebugEventGroups } from "@/app/layout/sidebar/right/DebugTab";

describe("buildDebugEventGroups", () => {
	it("keeps displayed events in the all bucket and their classified buckets", () => {
		const events = [
			{ type: "task.start", timestamp: 1, taskId: "task_1" },
			{ type: "artifact.publish", timestamp: 2, runId: "run_1" },
			{ type: "run.error", timestamp: 3, runId: "run_1" },
		] as AgentEvent[];

		const groups = buildDebugEventGroups(events);

		expect(groups.get("all")?.map(({ event }) => event.type)).toEqual([
			"task.start",
			"artifact.publish",
			"run.error",
		]);
		expect(groups.get("task")?.map(({ event }) => event.type)).toEqual([
			"task.start",
		]);
		expect(groups.get("artifact")?.map(({ event }) => event.type)).toEqual([
			"artifact.publish",
		]);
		expect(groups.get("run")?.map(({ event }) => event.type)).toEqual([
			"run.error",
		]);
	});
});
