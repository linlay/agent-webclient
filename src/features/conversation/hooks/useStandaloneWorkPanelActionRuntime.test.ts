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
	DESKTOP_ACTION_CALL,
	registerStandaloneWorkPanelActionHandler,
} from "@/features/conversation/hooks/useStandaloneWorkPanelActionRuntime";

function createActionRuntime(pathname: string, chatId = "") {
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
	if (chatId) dispatch({ type: "SET_CHAT_ID", chatId });
	const unregister = registerStandaloneWorkPanelActionHandler(client, {
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

describe("Standalone WorkPanel actions", () => {
	it("serves the seven standalone WorkPanel actions with stable item ids", async () => {
		const runtime = createActionRuntime("/", "chat-1");
		const handler = runtime.handlers.get(DESKTOP_ACTION_CALL);
		const source = { chatId: "chat-1", runId: "run-1" };

		const opened = await Promise.resolve(handler?.({
			requestId: "request-open",
			action: "desktop.workpanel.openWeb",
			args: { url: "https://例子.测试/path", title: "示例" },
			source,
		}));
		expect(opened).toMatchObject({
			ok: true,
			action: "desktop.workpanel.openWeb",
			result: {
				ok: true,
				workspaceId: "standalone:chat-1",
				state: {
					ownerChatId: "chat-1",
					activeItemId: expect.stringMatching(/^web:[A-Za-z0-9_-]+$/u),
				},
			},
		});

		const state = await Promise.resolve(handler?.({
			requestId: "request-state",
			action: "desktop.workpanel.getState",
			args: {},
			source,
		})) as any;
		expect(state.result.state.items.slice(0, 3).map((item: any) => item.itemId)).toEqual([
			"sidebar:overview",
			"sidebar:btw",
			"sidebar:debug",
		]);
		expect(state.result.state.items[3].itemId).toMatch(/^web:[A-Za-z0-9_-]+$/u);
	});

	it("opens supported current-chat descriptors and rejects unsupported descriptor ranges", async () => {
		const runtime = createActionRuntime("/", "chat-1");
		const handler = runtime.handlers.get(DESKTOP_ACTION_CALL);
		const invoke = (descriptor: Record<string, unknown>) => Promise.resolve().then(() => handler?.({
			action: "desktop.workpanel.openTab",
			args: { descriptor },
			source: { chatId: "chat-1" },
		}));

		await expect(invoke({
			kind: "webclient",
			module: "debug",
			route: "/debug/chat-1",
			context: { chatId: "chat-1", agentKey: "agent-1" },
		})).resolves.toMatchObject({
			ok: true,
			result: { state: { activeItemId: "sidebar:debug" } },
		});

		for (const descriptor of [
			{ kind: "native", surfaceKey: "terminal", context: {} },
			{ kind: "webclient", module: "planning", route: "/planning", context: { chatId: "chat-1" } },
			{ kind: "web", url: "https://example.test/", pinned: true },
			{ kind: "web", url: "https://example.test/", closable: false },
		]) {
			await expect(invoke(descriptor)).rejects.toMatchObject<Partial<WsInboundRequestError>>({
				type: "unsupported_in_current_view",
				code: 409,
			});
		}
	});

	it("requires the trusted source chat to match the current page chat", async () => {
		const runtime = createActionRuntime("/", "chat-current");
		const handler = runtime.handlers.get(DESKTOP_ACTION_CALL);

		await expect(Promise.resolve().then(() => handler?.({
			action: "desktop.workpanel.getState",
			args: {},
			source: { chatId: "chat-other" },
		}))).rejects.toMatchObject<Partial<WsInboundRequestError>>({
			type: "source_chat_mismatch",
			code: 403,
		});
	});

	it("refreshes and activates Web items, closes only Web items, and hides without deleting previews", async () => {
		const runtime = createActionRuntime("/", "chat-1");
		const handler = runtime.handlers.get(DESKTOP_ACTION_CALL);
		const invoke = (action: string, args: Record<string, unknown>) => Promise.resolve().then(() => handler?.({
			action,
			args,
			source: { chatId: "chat-1" },
		}));

		await invoke("desktop.workpanel.openWeb", { url: "https://first.example/" });
		const second = await invoke("desktop.workpanel.openWeb", { url: "https://second.example/" }) as any;
		await invoke("desktop.workpanel.activateTab", { tabId: second.result.item.itemId });
		expect(runtime.getState().activeWebPreviewUrl).toBe("https://second.example/");
		const refreshed = await invoke("desktop.workpanel.refreshWeb", { url: "https://first.example/" }) as any;
		const webItemId = refreshed.result.state.activeItemId;
		expect(runtime.getState().activeWebPreviewUrl).toBe("https://first.example/");
		expect(runtime.getState().webPreviewRefreshRevisionByUrl.get("https://first.example/")).toBe(1);

		await expect(invoke("desktop.workpanel.closeTab", { tabId: "sidebar:overview" }))
			.rejects.toMatchObject<Partial<WsInboundRequestError>>({ type: "unsupported_in_current_view" });
		await invoke("desktop.workpanel.closeTab", { tabId: webItemId });
		expect(runtime.getState().webPreviews.map((preview) => preview.url)).toEqual([
			"https://second.example/",
		]);

		await invoke("desktop.workpanel.closeWorkpanel", {});
		expect(runtime.getState().rightSidebarOpen).toBe(false);
		expect(runtime.getState().webPreviews).toHaveLength(1);
	});
});
