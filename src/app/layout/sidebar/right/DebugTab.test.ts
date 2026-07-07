import type { AgentEvent } from "@/app/state/types";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import {
	DebugTab,
	buildDebugChatRouteUrl,
	buildDebugChatStartOpenTargets,
	buildDebugEventGroups,
} from "@/app/layout/sidebar/right/DebugTab";

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
			{ type: "source.publish", timestamp: 2.5, publishId: "src_1" },
			{ type: "run.error", timestamp: 3, runId: "run_1" },
			{ type: "debug.runActivationSkipped", timestamp: 4, runId: "run_2" },
		] as AgentEvent[];

		const groups = buildDebugEventGroups(events);

		expect(groups.get("all")?.map(({ event }) => event.type)).toEqual([
			"task.start",
			"artifact.publish",
			"source.publish",
			"run.error",
			"debug.runActivationSkipped",
		]);
		expect(groups.get("task")?.map(({ event }) => event.type)).toEqual([
			"task.start",
		]);
		expect(groups.get("artifact")?.map(({ event }) => event.type)).toEqual([
			"artifact.publish",
		]);
		expect(groups.get("source")?.map(({ event }) => event.type)).toEqual([
			"source.publish",
		]);
		expect(groups.get("run")?.map(({ event }) => event.type)).toEqual([
			"run.error",
		]);
		expect(groups.get("debug")?.map(({ event }) => event.type)).toEqual([
			"debug.runActivationSkipped",
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

	it("builds chat.start route urls with the active query and target chatId", () => {
		expect(
			buildDebugChatRouteUrl(
				"agent",
				{ agentKey: "demo/agent", chatId: "chat 1" },
				"?desktopAuthContext=ctx&chatId=old",
			),
		).toBe("/agent/demo%2Fagent?desktopAuthContext=ctx&chatId=chat+1");
		expect(
			buildDebugChatRouteUrl(
				"copilot",
				{ agentKey: "demo-agent", chatId: "chat_1" },
				"?lang=en",
			),
		).toBe("/copilot/demo-agent?lang=en&chatId=chat_1");
		expect(
			buildDebugChatRouteUrl("agent", { agentKey: "", chatId: "chat_1" }),
		).toBe("");
	});

	it("builds Agent and Copilot targets for chat.start events", () => {
		const targets = buildDebugChatStartOpenTargets(
			{
				type: "chat.start",
				chatId: "chat_1",
				firstAgentKey: "fallback-agent",
			} as AgentEvent,
			"?theme=dark",
		);

		expect(targets.map((target) => target.href)).toEqual([
			"/agent/fallback-agent?theme=dark&chatId=chat_1",
			"/copilot/fallback-agent?theme=dark&chatId=chat_1",
		]);
		expect(
			buildDebugChatStartOpenTargets(
				{ type: "run.start", chatId: "chat_1", agentKey: "demo" } as AgentEvent,
				"",
			),
		).toEqual([]);
	});

	it("renders route buttons for chat.start when the agentKey is known from chat state", () => {
		useAppState.mockReturnValue({
			...createInitialState(),
			chats: [
				{
					chatId: "chat_1",
					firstAgentKey: "demo-agent",
				},
			],
			debugEvents: [{ type: "chat.start", chatId: "chat_1" }],
		});

		const html = renderToStaticMarkup(React.createElement(DebugTab));

		expect(html).toContain("chat.start");
		expect(html).toContain("新页面打开 Agent 会话");
		expect(html).toContain("新页面打开 Copilot 会话");
		expect(html).toContain("Agent");
		expect(html).toContain("Copilot");
	});
});
