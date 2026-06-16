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

	it("keeps websocket connection errors out of the main chat status", () => {
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

	it("renders run errors with detailed title", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			events: [{
				type: "run.error",
				runId: "run_1",
				error: {
					category: "runtime",
					code: "stream_failed",
					message: "api key quota exhausted",
				},
				timestamp: 123,
			}],
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("Run error");
		expect(html).toContain("status-pill is-error");
		expect(html).toContain("api key quota exhausted");
		expect(html).toContain('title="Run error:');
		expect(html).toContain('aria-label="Run error:');
	});

	it("renders streaming status as running", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			streaming: true,
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("Running");
		expect(html).toContain("status-pill is-running");
	});

	it("does not render usage stats when there is no usage snapshot and not streaming", () => {
		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).not.toContain("Usage stats");
		expect(html).not.toContain("Open usage stats");
	});

	it("renders usage entry with chat total from the latest snapshot", () => {
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
					modelKey: "deepseek-chat",
				},
				usage: {
					chat: {
						totalTokens: 3700,
						promptTokensDetails: { cacheHitTokens: 35, cacheMissTokens: 65 },
					},
					run: {
						totalTokens: 1234,
					},
				},
			},
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("Open usage stats");
		expect(html).toContain(">50</span>");
		expect(html).toContain('aria-label="3.7K"');
		expect(html).not.toContain("1.2K");
		expect(html).not.toContain("Cache hit");
		expect(html).not.toContain("Current call");
	});

	it("keeps the previous usage total visible while streaming", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			streaming: true,
			usageSnapshot: {
				type: "usage.snapshot",
				chatId: "chat_1",
				runId: "run_1",
				contextWindow: {
					maxSize: 128000,
					currentSize: 64000,
				},
				usage: {
					chat: {
						totalTokens: 3700,
						promptTokensDetails: { cacheHitTokens: 80, cacheMissTokens: 20 },
					},
					run: {
						totalTokens: 6700,
					},
				},
			},
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain('aria-label="3.7K"');
		expect(html).toContain(">50</span>");
		expect(html).not.toContain('aria-label="Usage"');
	});

	it("renders usage popover placeholders while waiting for the first streaming snapshot", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			streaming: true,
			usagePopoverOpen: true,
			usageSnapshot: null,
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("Usage stats");
		expect(html).toContain("Ctx Window");
		expect(html).toContain("Current call");
		expect(html).toContain("Latest run");
		expect(html).toContain("Chat total");
		expect(html).toContain("<span>Cache hit:</span><strong>--%</strong>");
		expect(html).toContain("<span>Total cost:</span><strong>--</strong>");
		expect(html).toContain("<dt>Prompt</dt><dd>-</dd>");
		expect(html).not.toContain("Waiting for usage stats");
	});

	it("renders an empty cache hit rate in the usage popover when chat cache tokens are zero or missing", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			usagePopoverOpen: true,
			usageSnapshot: {
				type: "usage.snapshot",
				chatId: "chat_1",
				runId: "run_1",
				contextWindow: {
					maxSize: 128000,
					currentSize: 64000,
				},
				usage: {
					chat: {
						totalTokens: 1,
						promptTokensDetails: { cacheHitTokens: 0, cacheMissTokens: 0 },
					},
				},
			},
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain(">50%</span>");
		expect(html).toContain('aria-label="Cache hit"');
		expect(html).toContain("<span>Cache hit:</span><strong>--%</strong>");
		expect(html).toContain("<span>Total cost:</span><strong>--</strong>");

		useAppState.mockReturnValue({
			...state,
			usagePopoverOpen: true,
			usageSnapshot: {
				type: "usage.snapshot",
				chatId: "chat_1",
				runId: "run_1",
				contextWindow: {
					maxSize: 128000,
					currentSize: 64000,
				},
				usage: {
					chat: { totalTokens: 1 },
				},
			},
		});

		const missingHtml = renderToStaticMarkup(React.createElement(TopNav));

		expect(missingHtml).toContain(">50%</span>");
		expect(missingHtml).toContain('aria-label="Cache hit"');
		expect(missingHtml).toContain("<span>Cache hit:</span><strong>--%</strong>");
	});

	it("calculates popover cache hit rate from chat totals instead of current call or run totals", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			usagePopoverOpen: true,
			usageSnapshot: {
				type: "usage.snapshot",
				chatId: "chat_1",
				runId: "run_1",
				usage: {
					current: {
						promptTokensDetails: { cacheHitTokens: 99, cacheMissTokens: 1 },
					},
					run: {
						promptTokensDetails: { cacheHitTokens: 90, cacheMissTokens: 10 },
					},
					chat: {
						totalTokens: 1,
						promptTokensDetails: { cacheHitTokens: 25, cacheMissTokens: 75 },
					},
				},
			},
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("<span>Cache hit:</span><strong>25.00%</strong>");
		expect(html).not.toContain('aria-label="99%"');
		expect(html).not.toContain('aria-label="90%"');
	});

	it("renders chat estimated cost near the cache hit rate", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			usagePopoverOpen: true,
			usageSnapshot: {
				type: "usage.snapshot",
				chatId: "chat_1",
				runId: "run_1",
				usage: {
					chat: {
						totalTokens: 1200,
						promptTokensDetails: { cacheHitTokens: 25, cacheMissTokens: 75 },
						estimatedCost: {
							currency: "CNY",
							inputCacheHit: 0.00007168,
							inputCacheMiss: 0.000086,
							output: 0.000122,
							total: 0.00027968,
						},
					},
				},
			},
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("<span>Cache hit:</span><strong>25.00%</strong>");
		expect(html).toContain('aria-label="Total cost"');
		expect(html).toContain("<span>Total cost:</span><strong>¥ 0.03 分</strong>");
	});

	it("renders chat estimated cost in yuan when it is over ten fen", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			usagePopoverOpen: true,
			usageSnapshot: {
				type: "usage.snapshot",
				chatId: "chat_1",
				runId: "run_1",
				usage: {
					chat: {
						totalTokens: 1200,
						promptTokensDetails: { cacheHitTokens: 25, cacheMissTokens: 75 },
						estimatedCost: { currency: "CNY", total: 0.1234 },
					},
				},
			},
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("<span>Total cost:</span><strong>¥ 0.123 元</strong>");
	});

	it("renders chat estimated cost with a dollar sign for USD", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			usagePopoverOpen: true,
			usageSnapshot: {
				type: "usage.snapshot",
				chatId: "chat_1",
				runId: "run_1",
				usage: {
					chat: {
						totalTokens: 1200,
						promptTokensDetails: { cacheHitTokens: 25, cacheMissTokens: 75 },
						estimatedCost: { currency: "USD", total: 0.0123 },
					},
				},
			},
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("<span>Total cost:</span><strong>$0.012</strong>");
	});

	it("renders historical chat usage with an empty current call section", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			usagePopoverOpen: true,
			usageSnapshot: {
				type: "usage.snapshot",
				chatId: "chat_1",
				runId: "run_1",
				usage: {
					current: {},
					chat: {
						promptTokens: 900,
						completionTokens: 300,
						totalTokens: 1200,
						promptTokensDetails: { cacheHitTokens: 400, cacheMissTokens: 499 },
						completionTokensDetails: { reasoningTokens: 33 },
						llmChatCompletionCount: 6,
						toolCallCount: 9,
					},
				},
			},
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("<span>Cache hit:</span><strong>44.49%</strong>");
		expect(html).not.toContain("1.2K tokens");
		expect(html).toContain("Current call");
		expect(html).toContain("<h3>Current call</h3></div><dl class=\"usage-metric-grid\"><div class=\"usage-metric\"><dt>Prompt</dt><dd>-</dd>");
		expect(html).toContain("Chat total");
		expect(html).toContain("1,200");
		expect(html).toContain("400");
		expect(html).toContain("499");
		expect(html).toContain("33");
		expect(html.match(/LLM calls/g)).toHaveLength(1);
		expect(html.match(/Tool calls/g)).toHaveLength(1);
		expect(html).not.toContain("Current call</h3><span class=\"usage-section-call-counts\"");
	});

	it("renders compact usage tool call counts", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			usagePopoverOpen: true,
			events: [
				{
					type: "context.compact.complete",
					compactionUsage: {
						promptTokens: 500,
						completionTokens: 50,
						totalTokens: 550,
						llmChatCompletionCount: 2,
						toolCallCount: 4,
					},
				},
			] as any,
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("Context compaction");
		expect(html).toContain("LLM calls");
		expect(html).toContain("Tool calls");
		expect(html).toContain("<strong>2</strong>");
		expect(html).toContain("<strong>4</strong>");
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
					modelKey: "deepseek-chat",
					reasoningEffort: "HIGH",
				},
				usage: {
					current: {
						promptTokens: 100,
						completionTokens: 20,
						totalTokens: 120,
						promptTokensDetails: { cacheHitTokens: 30, cacheMissTokens: 70 },
						completionTokensDetails: { reasoningTokens: 7 },
						llmChatCompletionCount: 1,
						toolCallCount: 2,
					},
					run: {
						promptTokens: 300,
						completionTokens: 70,
						totalTokens: 370,
						promptTokensDetails: { cacheHitTokens: 80, cacheMissTokens: 220 },
						completionTokensDetails: { reasoningTokens: 17 },
						llmChatCompletionCount: 3,
						toolCallCount: 4,
					},
					chat: {
						promptTokens: 800,
						completionTokens: 200,
						totalTokens: 1000,
						promptTokensDetails: { cacheHitTokens: 280, cacheMissTokens: 520 },
						completionTokensDetails: { reasoningTokens: 27 },
						llmChatCompletionCount: 8,
						toolCallCount: 11,
					},
				},
			},
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("Usage stats");
		expect(html).toContain("deepseek-chat");
		expect(html).toContain("· High");
		expect(html).toContain("Ctx Window");
		expect(html).toContain(">50%</span>");
		expect(html).toContain("64,000");
		expect(html).toContain("128,000");
		expect(html).toContain("64,000 / 128,000");
		expect(html).toContain("Current call");
		expect(html).toContain("Latest run");
		expect(html).toContain("Chat total");
		expect(html).toContain("Prompt");
		expect(html).toContain("Completion");
		expect(html).toContain("Total");
		expect(html).toContain("Reasoning");
		expect(html).toContain("Cache hit");
		expect(html).toContain("Cache miss");
		expect(html.match(/LLM calls/g)).toHaveLength(3);
		expect(html.match(/Tool calls/g)).toHaveLength(3);
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
