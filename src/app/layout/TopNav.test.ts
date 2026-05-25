import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import { resolveNextUsagePopoverOpen, TopNav } from "@/app/layout/TopNav";

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

const globalWithStorage = globalThis as typeof globalThis & {
	localStorage?: {
		getItem: jest.Mock;
		setItem: jest.Mock;
		removeItem: jest.Mock;
	};
	__AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("TopNav", () => {
	const originalLocalStorage = globalWithStorage.localStorage;

	beforeEach(() => {
		globalWithStorage.localStorage = {
			getItem: jest.fn(() => null),
			setItem: jest.fn(),
			removeItem: jest.fn(),
		};
		useAppDispatch.mockReturnValue(jest.fn());
		useAppState.mockReturnValue(createInitialState());
		delete globalWithStorage.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
	});

	afterAll(() => {
		if (originalLocalStorage) {
			globalWithStorage.localStorage = originalLocalStorage;
			return;
		}
		delete globalWithStorage.localStorage;
	});

	it("renders websocket error status with detailed title", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			wsStatus: "error",
			wsErrorMessage:
				"WebSocket 握手失败，请检查 Access Token 是否有效，并确认后端已启用 /ws。",
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain('id="api-status"');
		expect(html).toContain(">Idle<");
		expect(html).toContain("status-pill is-idle");
		expect(html).not.toContain("WebSocket connection error");
	});

	it("renders streaming status as running", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			streaming: true,
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("Running...");
		expect(html).toContain("status-pill is-running");
	});

	it("does not render usage stats when there is no usage snapshot and not streaming", () => {
		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).not.toContain("Usage stats");
		expect(html).not.toContain("Open usage stats");
	});

	it("renders usage entry with total tokens from the latest snapshot", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			usageSnapshot: {
				type: "usage.snapshot",
				chatId: "chat_1",
				runId: "run_1",
				model: { key: "deepseek-chat" },
				contextWindow: {
					maxSize: 128000,
					currentSize: 64000,
				},
				usage: {
					run: {
						totalTokens: 1234,
					},
				},
			},
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("Open usage stats");
		expect(html).toContain(">50%</span>");
		expect(html).toContain("1.2K");
		expect(html).not.toContain("1.2K tokens");
		expect(html).not.toContain("Current call");
	});

	it("toggles the usage popover state from the usage entry", () => {
		expect(resolveNextUsagePopoverOpen(false)).toBe(true);
		expect(resolveNextUsagePopoverOpen(true)).toBe(false);
	});

	it("renders usage popover details when opened", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			usagePopoverOpen: true,
			usageSnapshot: {
				type: "usage.snapshot",
				chatId: "chat_1",
				runId: "run_1",
				taskId: "task_1",
				model: { key: "deepseek-chat" },
				contextWindow: {
					maxSize: 128000,
					currentSize: 64000,
					estimatedNextCallSize: 8000,
				},
				usage: {
					current: {
						promptTokens: 100,
						completionTokens: 20,
						totalTokens: 120,
						promptTokensDetails: { cachedTokens: 30 },
						completionTokensDetails: { reasoningTokens: 7 },
						promptCacheHitTokens: 31,
						promptCacheMissTokens: 69,
						llmChatCompletionCount: 1,
					},
					run: {
						promptTokens: 300,
						completionTokens: 70,
						totalTokens: 370,
						promptTokensDetails: { cachedTokens: 80 },
						completionTokensDetails: { reasoningTokens: 17 },
						promptCacheHitTokens: 81,
						promptCacheMissTokens: 219,
						llmChatCompletionCount: 3,
					},
					chat: {
						promptTokens: 800,
						completionTokens: 200,
						totalTokens: 1000,
						promptTokensDetails: { cachedTokens: 280 },
						completionTokensDetails: { reasoningTokens: 27 },
						promptCacheHitTokens: 281,
						promptCacheMissTokens: 519,
						llmChatCompletionCount: 8,
					},
				},
			},
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("Usage stats");
		expect(html).toContain("deepseek-chat");
		expect(html).toContain("Context window");
		expect(html).toContain(">50%</span>");
		expect(html).toContain("64,000");
		expect(html).toContain("128,000");
		expect(html).toContain("Estimated next call 8,000");
		expect(html).toContain("Current call");
		expect(html).toContain("Current run");
		expect(html).toContain("Current chat");
		expect(html).toContain("Prompt");
		expect(html).toContain("Completion");
		expect(html).toContain("Total");
		expect(html).toContain("Reasoning");
		expect(html).toContain("Cache hit");
		expect(html).toContain("Cache miss");
		expect(html.match(/LLM calls/g)).toHaveLength(2);
		expect(html).toContain("Close usage stats");
		expect(html).not.toContain(">close<");
	});

	it("renders run errors when websocket transport is not in an error state", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			events: [{ type: "run.error" }] as any,
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("Run error");
		expect(html).toContain("status-pill is-error");
	});

	it("renders idle status with websocket-ready styling by default", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain(">Idle<");
		expect(html).toContain("status-pill is-idle");
	});

	it("does not render the debug panel button by default", () => {
		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).not.toContain("Open debug panel");
		expect(html).not.toContain("bug_report");
	});

	it("renders the debug panel button when enabled by env", () => {
		globalWithStorage.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
			DEBUG_PANEL_ENABLED: "true",
		};

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("Open debug panel");
		expect(html).toContain("bug_report");
	});
});
