import { useEffect } from "react";
import type React from "react";
import type { AppAction } from "@/app/state/actions";
import type { AppState, RightSidebarTabKey } from "@/app/state/types";
import { useAppContext } from "@/app/state/AppContext";
import {
	WsClient,
	WsInboundRequestError,
} from "@/features/transport/lib/wsClient";
import { useInboundRequestTransport } from "@/features/transport/hooks/useRealtimeTransport";

export const DESKTOP_ACTION_CALL = "desktop.action.call";

const WORKPANEL_ACTIONS = new Set([
	"desktop.workpanel.getState",
	"desktop.workpanel.openTab",
	"desktop.workpanel.openWeb",
	"desktop.workpanel.refreshWeb",
	"desktop.workpanel.activateTab",
	"desktop.workpanel.closeTab",
	"desktop.workpanel.closeWorkpanel",
]);

const SUPPORTED_RIGHT_SIDEBAR_TABS = [
	"overview",
	"btw",
	"debug",
] as const satisfies readonly RightSidebarTabKey[];
const WORKPANEL_URL_MAX_LENGTH = 2048;
const WORKPANEL_TITLE_MAX_LENGTH = 200;

type SupportedRightSidebarTab =
	(typeof SUPPORTED_RIGHT_SIDEBAR_TABS)[number];

interface WorkPanelActionRuntime {
	dispatch: React.Dispatch<AppAction>;
	getState: () => AppState;
	getPathname?: () => string;
}

type WorkPanelModule = SupportedRightSidebarTab;

const WORKPANEL_MODULE_TITLES: Record<WorkPanelModule, string> = {
	overview: "Overview",
	btw: "BTW",
	debug: "Debug",
};

function invalidRequest(message: string): never {
	throw new WsInboundRequestError("invalid_request", 400, message);
}

function unsupportedInCurrentView(message: string): never {
	throw new WsInboundRequestError(
		"unsupported_in_current_view",
		409,
		message,
	);
}

function sourceChatMismatch(message: string): never {
	throw new WsInboundRequestError("source_chat_mismatch", 403, message);
}

function requireRecord(payload: unknown): Record<string, unknown> {
	if (
		!payload ||
		typeof payload !== "object" ||
		Array.isArray(payload)
	) {
		return invalidRequest("payload must be an object");
	}
	return payload as Record<string, unknown>;
}

function requireExactKeys(
	record: Record<string, unknown>,
	allowed: readonly string[],
): void {
	const allowedKeys = new Set(allowed);
	const unsupported = Object.keys(record).find((key) => !allowedKeys.has(key));
	if (unsupported) {
		invalidRequest(`unsupported payload field: ${unsupported}`);
	}
}

function isSupportedRightSidebarTab(
	value: unknown,
): value is SupportedRightSidebarTab {
	return SUPPORTED_RIGHT_SIDEBAR_TABS.includes(
		value as SupportedRightSidebarTab,
	);
}

function normalizeWebPreviewUrl(value: unknown): string {
	if (typeof value !== "string") {
		return invalidRequest("url must be a string");
	}
	let candidate = value.trim();
	if (!candidate) {
		return invalidRequest("url is required");
	}
	if (Array.from(candidate).length > WORKPANEL_URL_MAX_LENGTH) {
		return invalidRequest(
			`url must be at most ${WORKPANEL_URL_MAX_LENGTH} characters`,
		);
	}
	if (candidate.startsWith("//")) {
		return invalidRequest("url must be an absolute http or https URL");
	}
	const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(candidate)?.[1]?.toLowerCase();
	if (scheme && scheme !== "http" && scheme !== "https") {
		return invalidRequest("url protocol must be http or https");
	}
	if (scheme && !/^https?:\/\//i.test(candidate)) {
		return invalidRequest("url must be an absolute http or https URL");
	}
	if (!scheme) {
		candidate = `https://${candidate}`;
	}
	let parsed: URL;
	try {
		parsed = new URL(candidate);
	} catch {
		return invalidRequest("url must be a valid http or https URL");
	}
	if (
		(parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
		!parsed.hostname
	) {
		return invalidRequest("url must be a valid http or https URL");
	}
	if (parsed.username || parsed.password) {
		return invalidRequest("url must not contain credentials");
	}
	return parsed.href;
}

function normalizeWebPreviewTitle(
	value: unknown,
	fallback: string,
): string {
	if (value === undefined) {
		return fallback;
	}
	if (typeof value !== "string") {
		return invalidRequest("title must be a string");
	}
	const title = value.trim();
	if (Array.from(title).length > WORKPANEL_TITLE_MAX_LENGTH) {
		return invalidRequest(
			`title must be at most ${WORKPANEL_TITLE_MAX_LENGTH} characters`,
		);
	}
	return title || fallback;
}

function normalizePathname(pathname: string): string {
	const normalized = String(pathname || "").trim() || "/";
	return normalized.length > 1 && normalized.endsWith("/")
		? normalized.slice(0, -1)
		: normalized;
}

function webPreviewItemId(url: string): string {
	const bytes = new TextEncoder().encode(url);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return `web:${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "")}`;
}

function requireCurrentChat(
	sourceValue: unknown,
	runtime: WorkPanelActionRuntime,
): string {
	const source = requireRecord(sourceValue);
	const sourceChatId = typeof source.chatId === "string"
		? source.chatId.trim()
		: "";
	const currentChatId = runtime.getState().chatId.trim();
	if (!sourceChatId) {
		return sourceChatMismatch("source.chatId is required");
	}
	if (!currentChatId || sourceChatId !== currentChatId) {
		return sourceChatMismatch(
			"source.chatId does not match the current page chat",
		);
	}
	return currentChatId;
}

function workPanelItems(state: AppState) {
	const builtins = SUPPORTED_RIGHT_SIDEBAR_TABS.map((module) => ({
		itemId: `sidebar:${module}`,
		stableKey: `sidebar:${module}`,
		descriptor: {
			kind: "webclient" as const,
			module,
			context: { chatId: state.chatId },
		},
		title: WORKPANEL_MODULE_TITLES[module],
		closable: false,
		pinned: true,
	}));
	const previews = state.webPreviews.map((preview) => ({
		itemId: webPreviewItemId(preview.url),
		stableKey: `web:${preview.url}`,
		descriptor: {
			kind: "web" as const,
			url: preview.url,
			title: preview.title,
		},
		title: preview.title,
		closable: true,
		pinned: false,
	}));
	return [...builtins, ...previews];
}

function readWorkPanelState(runtime: WorkPanelActionRuntime, chatId: string) {
	const state = runtime.getState();
	let activeItemId: string | null = null;
	if (state.rightSidebarOpen) {
		if (isSupportedRightSidebarTab(state.rightSidebarOpenTab)) {
			activeItemId = `sidebar:${state.rightSidebarOpenTab}`;
		} else if (
			state.rightSidebarOpenTab === "web" &&
			state.webPreviews.some(
				(preview) => preview.url === state.activeWebPreviewUrl,
			)
		) {
			activeItemId = webPreviewItemId(state.activeWebPreviewUrl);
		}
	}
	return {
		workspaceId: `standalone:${chatId}`,
		ownerChatId: chatId,
		items: workPanelItems(state),
		activeItemId,
		visible: state.rightSidebarOpen,
	};
}

function workPanelSuccess(
	action: string,
	runtime: WorkPanelActionRuntime,
	chatId: string,
	extra: Record<string, unknown> = {},
) {
	const state = readWorkPanelState(runtime, chatId);
	return {
		ok: true,
		action,
		result: {
			ok: true,
			workspaceId: state.workspaceId,
			state,
			...extra,
		},
	};
}

function ensureWorkPanelAvailable(runtime: WorkPanelActionRuntime): void {
	const pathname = runtime.getPathname?.() ??
		(typeof window === "undefined" ? "/" : window.location.pathname);
	if (normalizePathname(pathname) !== "/") {
		unsupportedInCurrentView("WorkPanel is unavailable in the current view");
	}
}

function openWorkPanelWeb(
	runtime: WorkPanelActionRuntime,
	urlValue: unknown,
	titleValue: unknown,
): { url: string; title: string } {
	const url = normalizeWebPreviewUrl(urlValue);
	const state = runtime.getState();
	const existing = state.webPreviews.find((preview) => preview.url === url);
	const title = normalizeWebPreviewTitle(
		titleValue,
		existing?.title || new URL(url).hostname || url,
	);
	runtime.dispatch({
		type: "OPEN_RIGHT_SIDEBAR",
		tab: "web",
		webPreview: { url, title },
	});
	return { url, title };
}

function openWorkPanelDescriptor(
	runtime: WorkPanelActionRuntime,
	descriptorValue: unknown,
	chatId: string,
): Record<string, unknown> {
	const descriptor = requireRecord(descriptorValue);
	const kind = descriptor.kind;
	if (kind === "native") {
		return unsupportedInCurrentView(
			"native WorkPanel descriptors are unsupported in the current view",
		);
	}
	if (kind === "web") {
		requireExactKeys(descriptor, ["kind", "url", "title", "pinned", "closable"]);
		if (descriptor.pinned === true || descriptor.closable === false) {
			return unsupportedInCurrentView(
				"pinned or non-closable Web descriptors are unsupported in the current view",
			);
		}
		return openWorkPanelWeb(runtime, descriptor.url, descriptor.title);
	}
	if (kind !== "webclient") {
		return unsupportedInCurrentView("unsupported WorkPanel descriptor kind");
	}
	requireExactKeys(descriptor, [
		"kind",
		"module",
		"route",
		"context",
		"title",
		"pinned",
		"closable",
	]);
	if (!isSupportedRightSidebarTab(descriptor.module)) {
		return unsupportedInCurrentView(
			"this WebClient module is unsupported in the current view",
		);
	}
	const context = requireRecord(descriptor.context);
	const descriptorChatId = typeof context.chatId === "string"
		? context.chatId.trim()
		: "";
	if (descriptorChatId && descriptorChatId !== chatId) {
		return sourceChatMismatch(
			"descriptor.context.chatId does not match source.chatId",
		);
	}
	runtime.dispatch({
		type: "OPEN_RIGHT_SIDEBAR",
		tab: descriptor.module,
	});
	return { module: descriptor.module, itemId: `sidebar:${descriptor.module}` };
}

export function registerStandaloneWorkPanelActionHandler(
	client: Pick<WsClient, "registerInboundRequestHandler">,
	runtime: WorkPanelActionRuntime,
): () => void {
	return client.registerInboundRequestHandler(
		DESKTOP_ACTION_CALL,
		(payload) => {
			ensureWorkPanelAvailable(runtime);
			const request = requireRecord(payload);
			requireExactKeys(request, ["requestId", "action", "args", "source"]);
			const action = typeof request.action === "string"
				? request.action.trim()
				: "";
			if (!WORKPANEL_ACTIONS.has(action)) {
				throw new WsInboundRequestError(
					"desktop_action_unsupported_runtime",
					409,
					"desktop action is unavailable in standalone runtime mode",
				);
			}
			const chatId = requireCurrentChat(request.source, runtime);
			const args = requireRecord(request.args);

			switch (action) {
				case "desktop.workpanel.getState":
					requireExactKeys(args, []);
					return workPanelSuccess(action, runtime, chatId);
				case "desktop.workpanel.openWeb": {
					requireExactKeys(args, ["url", "title"]);
					const item = openWorkPanelWeb(runtime, args.url, args.title);
					return workPanelSuccess(action, runtime, chatId, {
						item: {
							itemId: webPreviewItemId(item.url),
							descriptor: { kind: "web", ...item },
						},
					});
				}
				case "desktop.workpanel.openTab": {
					requireExactKeys(args, ["descriptor"]);
					const opened = openWorkPanelDescriptor(runtime, args.descriptor, chatId);
					return workPanelSuccess(action, runtime, chatId, { item: opened });
				}
				case "desktop.workpanel.refreshWeb": {
					requireExactKeys(args, ["url"]);
					const url = normalizeWebPreviewUrl(args.url);
					const preview = runtime.getState().webPreviews.find(
						(candidate) => candidate.url === url,
					);
					if (!preview) {
						return unsupportedInCurrentView(
							"Web Preview item is unavailable in the current view",
						);
					}
					runtime.dispatch({
						type: "OPEN_RIGHT_SIDEBAR",
						tab: "web",
						activeWebPreviewUrl: url,
					});
					runtime.dispatch({ type: "REFRESH_WEB_PREVIEW", url });
					return workPanelSuccess(action, runtime, chatId, {
						itemId: webPreviewItemId(url),
					});
				}
				case "desktop.workpanel.activateTab": {
					requireExactKeys(args, ["tabId"]);
					if (typeof args.tabId !== "string" || !args.tabId.trim()) {
						return invalidRequest("tabId is required");
					}
					const tabId = args.tabId.trim();
					const item = workPanelItems(runtime.getState()).find(
						(candidate) => candidate.itemId === tabId,
					);
					if (!item) {
						return unsupportedInCurrentView(
							"WorkPanel item is unavailable in the current view",
						);
					}
					if (item.descriptor.kind === "web") {
						runtime.dispatch({
							type: "OPEN_RIGHT_SIDEBAR",
							tab: "web",
							activeWebPreviewUrl: item.descriptor.url,
						});
					} else {
						runtime.dispatch({
							type: "OPEN_RIGHT_SIDEBAR",
							tab: item.descriptor.module,
						});
					}
					return workPanelSuccess(action, runtime, chatId, { item });
				}
				case "desktop.workpanel.closeTab": {
					requireExactKeys(args, ["tabId"]);
					if (typeof args.tabId !== "string" || !args.tabId.trim()) {
						return invalidRequest("tabId is required");
					}
					const tabId = args.tabId.trim();
					const item = workPanelItems(runtime.getState()).find(
						(candidate) => candidate.itemId === tabId,
					);
					if (!item) {
						return unsupportedInCurrentView(
							"WorkPanel item is unavailable in the current view",
						);
					}
					if (item.descriptor.kind !== "web") {
						return unsupportedInCurrentView(
							"built-in WorkPanel items cannot be closed",
						);
					}
					runtime.dispatch({ type: "CLOSE_WEB_PREVIEW", url: item.descriptor.url });
					return workPanelSuccess(action, runtime, chatId, { item });
				}
				case "desktop.workpanel.closeWorkpanel":
					requireExactKeys(args, []);
					runtime.dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
					return workPanelSuccess(action, runtime, chatId);
				default:
					return unsupportedInCurrentView("unsupported WorkPanel action");
			}
		},
	);
}

export function useStandaloneWorkPanelActionRuntime(): void {
	const { dispatch, stateRef } = useAppContext();
	const inbound = useInboundRequestTransport();

	useEffect(() => {
		const pathname = typeof window === "undefined"
			? "/"
			: normalizePathname(window.location.pathname);
		if (!inbound || pathname !== "/") {
			return;
		}
		const registrar: Pick<WsClient, "registerInboundRequestHandler"> = {
			registerInboundRequestHandler: (type, handler) =>
				inbound.register(type, handler),
		};
		return registerStandaloneWorkPanelActionHandler(registrar, {
			dispatch,
			getState: () => stateRef.current,
		});
	}, [dispatch, inbound, stateRef]);
}
