import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialState } from "../../context/AppContext";
import { TopNav } from "./TopNav";

jest.mock("../../context/AppContext", () => {
	const actual = jest.requireActual("../../context/AppContext");
	return {
		...actual,
		useAppState: jest.fn(),
		useAppDispatch: jest.fn(),
	};
});

const { useAppState, useAppDispatch } = jest.requireMock(
	"../../context/AppContext",
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
			transportMode: "ws",
			wsStatus: "error",
			wsErrorMessage:
				"WebSocket 握手失败，请检查 Access Token 是否有效，并确认后端已启用 /ws。",
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain('id="api-status"');
		expect(html).toContain("WebSocket 连接异常");
		expect(html).toContain("status-pill is-error");
		expect(html).toContain(
			'title="WebSocket 握手失败，请检查 Access Token 是否有效，并确认后端已启用 /ws。"',
		);
	});

	it("renders websocket connecting status as running", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			transportMode: "ws",
			wsStatus: "connecting",
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("WebSocket 连接中...");
		expect(html).toContain("status-pill is-running");
	});

	it("renders websocket idle status distinctly when transport mode is ws", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			transportMode: "ws",
			wsStatus: "connected",
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain(">ws已就绪<");
		expect(html).toContain("status-pill is-idle");
	});

	it("renders run errors when websocket transport is not in an error state", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			events: [{ type: "run.error" }] as any,
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain("运行异常");
		expect(html).toContain("status-pill is-error");
	});

	it("renders idle status for non-websocket transport", () => {
		const state = createInitialState();
		useAppState.mockReturnValue({
			...state,
			transportMode: "sse",
		});

		const html = renderToStaticMarkup(React.createElement(TopNav));

		expect(html).toContain(">就绪<");
		expect(html).toContain("status-pill is-idle");
	});
});
