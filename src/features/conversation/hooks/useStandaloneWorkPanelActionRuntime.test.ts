import { appReducer } from "@/app/state/reducer";
import { createInitialState } from "@/app/state/state";
import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/AppContext";
import type { WsClient, WsInboundRequestHandler } from "@/features/transport/lib/wsClient";
import { WsInboundRequestError } from "@/features/transport/lib/wsClient";
import {
	STANDALONE_DESKTOP_ACTIONS,
	registerStandaloneDesktopActionHandlers,
} from "@/features/conversation/hooks/useStandaloneWorkPanelActionRuntime";
import {
	clearDisplay,
	getActiveDisplay,
} from "@/features/display/lib/displayRuntime";

function createActionRuntime(pathname: string, chatId = "", runId = "") {
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
		registerInboundRequestHandler: (type: string, handler: WsInboundRequestHandler) => {
			handlers.set(type, handler);
			return () => handlers.delete(type);
		},
	} as unknown as WsClient;
	let state: AppState = createInitialState();
	const dispatch = (action: AppAction) => {
		state = appReducer(state, action);
	};
	if (chatId) dispatch({ type: "SET_CHAT_ID", chatId });
	if (runId) dispatch({ type: "SET_RUN_ID", runId });
	const unregister = registerStandaloneDesktopActionHandlers(client, {
		dispatch,
		getState: () => state,
		getPathname: () => pathname,
	});
	const invoke = (
		type: string,
		payload: Record<string, unknown>,
		source: Record<string, unknown> = { chatId, runId },
	) => Promise.resolve().then(() => handlers.get(type)?.(payload, {
		id: `request-${type}`,
		type,
		source,
	}));
	return { handlers, getState: () => state, invoke, unregister };
}

describe("Standalone Desktop actions", () => {
	afterEach(() => {
		const current = getActiveDisplay();
		if (current) clearDisplay(current.token);
	});

	it("registers seven WorkPanel types and desktop.display without the legacy envelope", () => {
		const runtime = createActionRuntime("/", "chat-1", "run-1");
		expect([...runtime.handlers.keys()]).toEqual(STANDALONE_DESKTOP_ACTIONS);
		expect(runtime.handlers.has("desktop.action.call")).toBe(false);
		runtime.unregister();
		expect(runtime.handlers.size).toBe(0);
	});

	it("serves direct WorkPanel payloads with stable item ids", async () => {
		const runtime = createActionRuntime("/", "chat-1", "run-1");
		const opened = await runtime.invoke("desktop.workpanel.openWeb", {
			url: "https://例子.测试/path",
			title: "示例",
		});
		expect(opened).toMatchObject({
			ok: true,
			action: "desktop.workpanel.openWeb",
			result: {
				workspaceId: "standalone:chat-1",
				state: { ownerChatId: "chat-1", activeItemId: expect.stringMatching(/^web:[A-Za-z0-9_-]+$/u) },
			},
		});

		const state = await runtime.invoke("desktop.workpanel.getState", {}) as any;
		expect(state.result.state.items.slice(0, 3).map((item: any) => item.itemId)).toEqual([
			"sidebar:overview",
			"sidebar:btw",
			"sidebar:debug",
		]);
		expect(state.result.state.items[3].itemId).toMatch(/^web:[A-Za-z0-9_-]+$/u);
	});

	it("validates source Chat, Run, owner shape, and current root view", async () => {
		const runtime = createActionRuntime("/", "chat-current", "run-current");
		await expect(runtime.invoke("desktop.workpanel.getState", {}, {
			chatId: "chat-other",
			runId: "run-current",
		})).rejects.toMatchObject<Partial<WsInboundRequestError>>({ type: "source_chat_mismatch", code: 403 });
		await expect(runtime.invoke("desktop.workpanel.getState", {}, {
			chatId: "chat-current",
			runId: "run-other",
		})).rejects.toMatchObject<Partial<WsInboundRequestError>>({ type: "source_run_mismatch", code: 403 });
		await expect(runtime.invoke("desktop.workpanel.getState", {}, {
			chatId: "chat-current",
			runId: "run-current",
			agentKey: "agent-1",
			teamId: "team-1",
		})).rejects.toMatchObject<Partial<WsInboundRequestError>>({ type: "invalid_request", code: 400 });

		const otherView = createActionRuntime("/history", "chat-current", "run-current");
		await expect(otherView.invoke("desktop.workpanel.getState", {}))
			.rejects.toMatchObject<Partial<WsInboundRequestError>>({ type: "unsupported_in_current_view", code: 409 });
	});

	it("opens descriptors, refreshes and closes only Web items", async () => {
		const runtime = createActionRuntime("/", "chat-1", "run-1");
		await expect(runtime.invoke("desktop.workpanel.openTab", {
			descriptor: {
				kind: "webclient",
				module: "debug",
				route: "/debug/chat-1",
				context: { chatId: "chat-1", agentKey: "agent-1" },
			},
		})).resolves.toMatchObject({ result: { state: { activeItemId: "sidebar:debug" } } });

		await runtime.invoke("desktop.workpanel.openWeb", { url: "https://first.example/" });
		const second = await runtime.invoke("desktop.workpanel.openWeb", { url: "https://second.example/" }) as any;
		await runtime.invoke("desktop.workpanel.activateTab", { tabId: second.result.item.itemId });
		const refreshed = await runtime.invoke("desktop.workpanel.refreshWeb", { url: "https://first.example/" }) as any;
		expect(runtime.getState().webPreviewRefreshRevisionByUrl.get("https://first.example/")).toBe(1);
		await expect(runtime.invoke("desktop.workpanel.closeTab", { tabId: "sidebar:overview" }))
			.rejects.toMatchObject<Partial<WsInboundRequestError>>({ type: "unsupported_in_current_view" });
		await runtime.invoke("desktop.workpanel.closeTab", { tabId: refreshed.result.state.activeItemId });
		await runtime.invoke("desktop.workpanel.closeWorkpanel", {});
		expect(runtime.getState().rightSidebarOpen).toBe(false);
		expect(runtime.getState().webPreviews.map((preview) => preview.url)).toEqual(["https://second.example/"]);
	});

	it("accepts all display effects, replaces the active effect, and rejects invalid duration", async () => {
		const runtime = createActionRuntime("/", "chat-1", "run-1");
		for (const effect of ["fireworks", "snowfall", "nationalDay"] as const) {
			const response = await runtime.invoke("desktop.display", { kind: "effect", effect }) as any;
			expect(response).toMatchObject({
				ok: true,
				action: "desktop.display",
				result: { status: "accepted", kind: "effect", effect, durationMs: 8_000 },
			});
			expect(getActiveDisplay()?.effect).toBe(effect);
		}
		await expect(runtime.invoke("desktop.display", {
			kind: "effect",
			effect: "fireworks",
			durationMs: 999,
		})).rejects.toMatchObject<Partial<WsInboundRequestError>>({ type: "invalid_args", code: 400 });
		await expect(runtime.invoke("desktop.display", {
			kind: "effect",
			effect: "fireworks",
			extra: true,
		})).rejects.toMatchObject<Partial<WsInboundRequestError>>({ type: "invalid_args", code: 400 });
	});
});
