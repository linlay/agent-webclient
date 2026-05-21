import type { AgentEvent } from "@/app/state/types";
import { buildDebugEventGroups } from "@/app/layout/sidebar/right/DebugTab";

const globalWithRuntimeConfig = globalThis as typeof globalThis & {
	__AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("buildDebugEventGroups", () => {
	beforeEach(() => {
		delete globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
	});

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

	it("hides stream delta events by default while keeping snapshots and final results", () => {
		const events = [
			{ type: "content.start", timestamp: 1, contentId: "content_1" },
			{ type: "content.delta", timestamp: 2, contentId: "content_1", delta: "hi" },
			{ type: "content.end", timestamp: 3, contentId: "content_1", text: "hi" },
			{ type: "content.snapshot", timestamp: 4, contentId: "content_1", text: "hi" },
			{ type: "reasoning.delta", timestamp: 5, reasoningId: "reasoning_1", delta: "think" },
			{ type: "reasoning.snapshot", timestamp: 6, reasoningId: "reasoning_1", text: "think" },
			{ type: "tool.args", timestamp: 7, toolId: "tool_1", delta: "{\"q\":1}" },
			{ type: "tool.snapshot", timestamp: 8, toolId: "tool_1", arguments: "{\"q\":1}" },
			{ type: "tool.result", timestamp: 9, toolId: "tool_1", result: "ok" },
			{ type: "action.args", timestamp: 10, actionId: "action_1", delta: "{}" },
			{ type: "action.snapshot", timestamp: 11, actionId: "action_1", arguments: "{}" },
			{ type: "run.complete", timestamp: 12, runId: "run_1" },
		] as AgentEvent[];

		const groups = buildDebugEventGroups(events);

		expect(groups.get("all")?.map(({ event }) => event.type)).toEqual([
			"content.snapshot",
			"reasoning.snapshot",
			"tool.snapshot",
			"tool.result",
			"action.snapshot",
			"run.complete",
		]);
		expect(groups.get("content")?.map(({ event }) => event.type)).toEqual([
			"content.snapshot",
		]);
		expect(groups.get("reasoning")?.map(({ event }) => event.type)).toEqual([
			"reasoning.snapshot",
		]);
		expect(groups.get("tool")?.map(({ event }) => event.type)).toEqual([
			"tool.snapshot",
			"tool.result",
		]);
		expect(groups.get("action")?.map(({ event }) => event.type)).toEqual([
			"action.snapshot",
		]);
	});

	it("shows stream delta events when delta logs are enabled", () => {
		globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
			DELTA_LOGS_ENABLED: "true",
		};
		const events = [
			{ type: "content.delta", timestamp: 1, contentId: "content_1", delta: "hi" },
			{ type: "reasoning.delta", timestamp: 2, reasoningId: "reasoning_1", delta: "think" },
			{ type: "tool.args", timestamp: 3, toolId: "tool_1", delta: "{\"q\":1}" },
			{ type: "content.snapshot", timestamp: 4, contentId: "content_1", text: "hi" },
		] as AgentEvent[];

		const groups = buildDebugEventGroups(events);

		expect(groups.get("all")?.map(({ event }) => event.type)).toEqual([
			"content.delta",
			"reasoning.delta",
			"tool.args",
			"content.snapshot",
		]);
	});
});
