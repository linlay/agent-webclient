import { appReducer } from "@/app/state/reducer";
import { createInitialState } from "@/app/state/state";
import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";
import type {
	WsClient,
	WsInboundRequestHandler,
} from "@/features/transport/lib/wsClient";
import { WsInboundRequestError } from "@/features/transport/lib/wsClient";
import {
	registerWebClientSidebarActionHandlers,
	WEBCLIENT_SIDEBAR_GET_STATE,
	WEBCLIENT_SIDEBAR_OPEN_URL,
	WEBCLIENT_SIDEBAR_REFRESH_URL,
	WEBCLIENT_SIDEBAR_SET_STATE,
} from "@/features/conversation/hooks/useWebClientActionRuntime";

function createActionRuntime(pathname: string) {
	const storage = {
		getItem: () => null,
		setItem: () => undefined,
		removeItem: () => undefined,
	};
	(globalThis as Record<string, unknown>).localStorage = storage;
	(globalThis as Record<string, unknown>).window = {
		...((globalThis as Record<string, unknown>).window as object | undefined),
		localStorage: storage,
		location: { pathname },
	};
	const handlers = new Map<string, WsInboundRequestHandler>();
	const client = {
		registerInboundRequestHandler: (
			type: string,
			handler: WsInboundRequestHandler,
		) => {
			handlers.set(type, handler);
			return () => handlers.delete(type);
		},
	} as unknown as WsClient;
	let state: AppState = createInitialState();
	const dispatch = (action: AppAction) => {
		state = appReducer(state, action);
	};
	const unregister = registerWebClientSidebarActionHandlers(client, {
		dispatch,
		getState: () => state,
		getPathname: () => pathname,
	});
	return {
		handlers,
		getState: () => state,
		unregister,
	};
}

describe("WebClient sidebar actions", () => {
	it("reports route availability and the real sidebar state", async () => {
		const runtime = createActionRuntime("/agent/demo");
		const handler = runtime.handlers.get(WEBCLIENT_SIDEBAR_GET_STATE);

		await expect(Promise.resolve(handler?.({}))).resolves.toEqual({
			available: {
				left: false,
				right: true,
			},
			left: {
				open: true,
			},
			right: {
				open: false,
				tab: null,
				supportedTabs: ["overview", "btw", "debug"],
			},
		});
	});

	it("opens an explicit right sidebar tab and is idempotent", async () => {
		const runtime = createActionRuntime("/copilot/demo");
		const handler = runtime.handlers.get(WEBCLIENT_SIDEBAR_SET_STATE);

		await expect(
			Promise.resolve(
				handler?.({ sidebar: "right", open: true, tab: "debug" }),
			),
		).resolves.toEqual({
			applied: true,
			sidebar: "right",
			open: true,
			tab: "debug",
		});
		expect(runtime.getState().rightSidebarOpen).toBe(true);
		expect(runtime.getState().rightSidebarOpenTab).toBe("debug");

		await expect(
			Promise.resolve(
				handler?.({ sidebar: "right", open: true, tab: "debug" }),
			),
		).resolves.toEqual({
			applied: false,
			sidebar: "right",
			open: true,
			tab: "debug",
		});
	});

	it("rejects unavailable views and invalid payloads", async () => {
		const runtime = createActionRuntime("/agent/demo");
		const handler = runtime.handlers.get(WEBCLIENT_SIDEBAR_SET_STATE);

		await expect(
			Promise.resolve().then(() =>
				handler?.({ sidebar: "left", open: false }),
			),
		).rejects.toMatchObject<Partial<WsInboundRequestError>>({
			type: "unsupported_in_current_view",
			code: 409,
		});
		await expect(
			Promise.resolve().then(() =>
				handler?.({ sidebar: "right", open: false, tab: "debug" }),
			),
		).rejects.toMatchObject<Partial<WsInboundRequestError>>({
			type: "invalid_request",
			code: 400,
		});
	});

	it("opens and normalizes a URL in the right web sidebar", async () => {
		const runtime = createActionRuntime("/agent/demo");
		const handler = runtime.handlers.get(WEBCLIENT_SIDEBAR_OPEN_URL);

		await expect(
			Promise.resolve(
				handler?.({ url: "www.sina.com.cn", title: "新浪" }),
			),
		).resolves.toEqual({
			applied: true,
			sidebar: "right",
			open: true,
			tab: "web",
			url: "https://www.sina.com.cn/",
			title: "新浪",
		});
		expect(runtime.getState().webPreviews).toEqual([
			{
				title: "新浪",
				url: "https://www.sina.com.cn/",
			},
		]);
		expect(runtime.getState().activeWebPreviewUrl).toBe(
			"https://www.sina.com.cn/",
		);
	});

	it("reuses an active URL idempotently and derives a default title", async () => {
		const runtime = createActionRuntime("/");
		const handler = runtime.handlers.get(WEBCLIENT_SIDEBAR_OPEN_URL);

		await expect(
			Promise.resolve(handler?.({ url: "https://example.com" })),
		).resolves.toMatchObject({
			applied: true,
			url: "https://example.com/",
			title: "example.com",
		});
		await expect(
			Promise.resolve(handler?.({ url: "https://example.com/" })),
		).resolves.toMatchObject({
			applied: false,
			url: "https://example.com/",
			title: "example.com",
		});
		expect(runtime.getState().webPreviews).toHaveLength(1);
	});

	it("refreshes an existing normalized URL without changing sidebar or active preview state", async () => {
		const runtime = createActionRuntime("/agent/demo");
		const openUrl = runtime.handlers.get(WEBCLIENT_SIDEBAR_OPEN_URL);
		const setState = runtime.handlers.get(WEBCLIENT_SIDEBAR_SET_STATE);
		const refreshUrl = runtime.handlers.get(WEBCLIENT_SIDEBAR_REFRESH_URL);

		await Promise.resolve(openUrl?.({ url: "example.com" }));
		await Promise.resolve(openUrl?.({ url: "https://second.example" }));
		await Promise.resolve(
			setState?.({ sidebar: "right", open: false }),
		);

		await expect(
			Promise.resolve(refreshUrl?.({ url: "https://example.com" })),
		).resolves.toEqual({
			applied: true,
			sidebar: "right",
			open: false,
			tab: null,
			url: "https://example.com/",
		});
		expect(runtime.getState().activeWebPreviewUrl).toBe(
			"https://second.example/",
		);
		expect(
			runtime.getState().webPreviewRefreshRevisionByUrl.get(
				"https://example.com/",
			),
		).toBe(1);

		await Promise.resolve(refreshUrl?.({ url: "example.com" }));
		expect(
			runtime.getState().webPreviewRefreshRevisionByUrl.get(
				"https://example.com/",
			),
		).toBe(2);
	});

	it("rejects invalid, missing, and unavailable refresh targets", async () => {
		const runtime = createActionRuntime("/agent/demo");
		const handler = runtime.handlers.get(WEBCLIENT_SIDEBAR_REFRESH_URL);

		for (const payload of [
			{},
			{ url: "javascript:alert(1)" },
			{ url: "//example.com" },
			{ url: "https://user:secret@example.com" },
			{ url: "https://example.com", title: "unsupported" },
		]) {
			await expect(
				Promise.resolve().then(() => handler?.(payload)),
			).rejects.toMatchObject<Partial<WsInboundRequestError>>({
				type: "invalid_request",
				code: 400,
			});
		}

		await expect(
			Promise.resolve().then(() =>
				handler?.({ url: "https://example.com" }),
			),
		).rejects.toMatchObject<Partial<WsInboundRequestError>>({
			type: "unsupported_in_current_view",
			code: 409,
		});

		const unavailable = createActionRuntime("/settings");
		await expect(
			Promise.resolve().then(() =>
				unavailable.handlers
					.get(WEBCLIENT_SIDEBAR_REFRESH_URL)
					?.({ url: "https://example.com" }),
			),
		).rejects.toMatchObject<Partial<WsInboundRequestError>>({
			type: "unsupported_in_current_view",
			code: 409,
		});
	});

	it("rejects unsafe or unavailable URL previews", async () => {
		const runtime = createActionRuntime("/agent/demo");
		const handler = runtime.handlers.get(WEBCLIENT_SIDEBAR_OPEN_URL);

		for (const payload of [
			{ url: "javascript:alert(1)" },
			{ url: "//example.com" },
			{ url: "https://user:secret@example.com" },
			{ url: "https://example.com", title: null },
			{ url: "https://example.com", unexpected: true },
		]) {
			await expect(
				Promise.resolve().then(() => handler?.(payload)),
			).rejects.toMatchObject<Partial<WsInboundRequestError>>({
				type: "invalid_request",
				code: 400,
			});
		}

		const unavailable = createActionRuntime("/settings");
		await expect(
			Promise.resolve().then(() =>
				unavailable.handlers
					.get(WEBCLIENT_SIDEBAR_OPEN_URL)
					?.({ url: "https://example.com" }),
			),
		).rejects.toMatchObject<Partial<WsInboundRequestError>>({
			type: "unsupported_in_current_view",
			code: 409,
		});
	});

	it("unregisters the exact action handlers", () => {
		const runtime = createActionRuntime("/");
		runtime.unregister();
		expect(runtime.handlers.size).toBe(0);
	});
});
