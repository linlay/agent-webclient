import type { AgentEvent } from "@/app/state/types";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import { DebugTab, buildDebugEventGroups } from "@/app/layout/sidebar/right/DebugTab";

jest.mock("@/app/state/AppContext", () => {
	const actual = jest.requireActual("@/app/state/AppContext");
	return {
		...actual,
		useAppState: jest.fn(),
		useAppDispatch: jest.fn(),
	};
});

const { useAppState, useAppDispatch } = jest.requireMock(
	"@/app/state/AppContext",
) as {
	useAppState: jest.Mock;
	useAppDispatch: jest.Mock;
};

const globalWithRuntimeConfig = globalThis as typeof globalThis & {
	__AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};
const globalWithStorage = globalThis as typeof globalThis & {
	localStorage?: {
		getItem: jest.Mock;
		setItem: jest.Mock;
		removeItem: jest.Mock;
	};
};

describe("buildDebugEventGroups", () => {
	const originalLocalStorage = globalWithStorage.localStorage;

	beforeEach(() => {
		delete globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
		globalWithStorage.localStorage = {
			getItem: jest.fn(() => null),
			setItem: jest.fn(),
			removeItem: jest.fn(),
		};
		useAppDispatch.mockReturnValue(jest.fn());
	});

	afterEach(() => {
		globalWithStorage.localStorage = originalLocalStorage;
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
			{ type: "planning.delta", timestamp: 6.5, planningId: "planning_1", delta: "plan" },
			{ type: "planning.snapshot", timestamp: 6.7, planningId: "planning_1", text: "plan" },
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
			"planning.snapshot",
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
		expect(groups.get("planning")?.map(({ event }) => event.type)).toEqual([
			"planning.snapshot",
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
			{ type: "planning.delta", timestamp: 3, planningId: "planning_1", delta: "plan" },
			{ type: "tool.args", timestamp: 4, toolId: "tool_1", delta: "{\"q\":1}" },
			{ type: "content.snapshot", timestamp: 5, contentId: "content_1", text: "hi" },
		] as AgentEvent[];

		const groups = buildDebugEventGroups(events);

		expect(groups.get("all")?.map(({ event }) => event.type)).toEqual([
			"content.delta",
			"reasoning.delta",
			"planning.delta",
			"tool.args",
			"content.snapshot",
		]);
	});

	it("renders from debugEvents even when raw events only contain filtered deltas", () => {
		useAppState.mockReturnValue({
			...createInitialState(),
			events: [
				{ type: "reasoning.delta", reasoningId: "reasoning_1", delta: "x" },
			],
			debugEvents: [
				{ type: "run.start", runId: "run_1" },
				{ type: "reasoning.snapshot", reasoningId: "reasoning_1", text: "done" },
			],
		});

		const html = renderToStaticMarkup(React.createElement(DebugTab));

		expect(html).toContain("run.start");
		expect(html).toContain("reasoning.snapshot");
		expect(html).not.toContain("reasoning.delta");
		expect(html).not.toContain("暂无事件");
	});
});
