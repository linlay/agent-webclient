import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "@/app/state/AppContext";
import { TopNav } from "@/app/layout/TopNav";

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
	__APP_DEBUG_PANEL_ENABLED__?: unknown;
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
		delete globalWithStorage.__APP_DEBUG_PANEL_ENABLED__;
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
		globalWithStorage.__APP_DEBUG_PANEL_ENABLED__ = "true";

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("Open debug panel");
		expect(html).toContain("bug_report");
	});
});
