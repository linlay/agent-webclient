import { useEffect } from "react";
import type React from "react";
import type { AppAction } from "@/app/state/actions";
import type { AppState, RightSidebarTabKey } from "@/app/state/types";
import { useAppContext } from "@/app/state/AppContext";
import { isGatewayBackendMode } from "@/shared/config/backendMode";
import { ensureAccessToken } from "@/shared/data";
import { isAppMode } from "@/shared/utils/routing";
import {
	WsClient,
	WsInboundRequestError,
} from "@/features/transport/lib/wsClient";
import {
	destroyWsClient,
	initWsClient,
	subscribeWsClient,
} from "@/features/transport/lib/wsClientSingleton";

export const WEBCLIENT_SIDEBAR_GET_STATE = "webclient.sidebar.getState";
export const WEBCLIENT_SIDEBAR_SET_STATE = "webclient.sidebar.setState";
export const WEBCLIENT_SIDEBAR_OPEN_URL = "webclient.sidebar.openUrl";

const SUPPORTED_RIGHT_SIDEBAR_TABS = [
	"overview",
	"btw",
	"debug",
] as const satisfies readonly RightSidebarTabKey[];
const WEBCLIENT_SIDEBAR_URL_MAX_LENGTH = 2048;
const WEBCLIENT_SIDEBAR_TITLE_MAX_LENGTH = 200;

type SupportedRightSidebarTab =
	(typeof SUPPORTED_RIGHT_SIDEBAR_TABS)[number];

interface SidebarActionRuntime {
	dispatch: React.Dispatch<AppAction>;
	getState: () => AppState;
	getPathname?: () => string;
}

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
	if (Array.from(candidate).length > WEBCLIENT_SIDEBAR_URL_MAX_LENGTH) {
		return invalidRequest(
			`url must be at most ${WEBCLIENT_SIDEBAR_URL_MAX_LENGTH} characters`,
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
	if (Array.from(title).length > WEBCLIENT_SIDEBAR_TITLE_MAX_LENGTH) {
		return invalidRequest(
			`title must be at most ${WEBCLIENT_SIDEBAR_TITLE_MAX_LENGTH} characters`,
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

function sidebarAvailability(pathname: string): {
	left: boolean;
	right: boolean;
} {
	const path = normalizePathname(pathname);
	return {
		left: path === "/",
		right:
			path === "/" ||
			path === "/copilot" ||
			path.startsWith("/copilot/") ||
			path.startsWith("/agent/"),
	};
}

function readSidebarState(runtime: SidebarActionRuntime) {
	const state = runtime.getState();
	const pathname =
		runtime.getPathname?.() ??
		(typeof window === "undefined" ? "/" : window.location.pathname);
	return {
		available: sidebarAvailability(pathname),
		left: {
			open: state.leftDrawerOpen,
		},
		right: {
			open: state.rightSidebarOpen,
			tab: state.rightSidebarOpenTab,
			supportedTabs: [...SUPPORTED_RIGHT_SIDEBAR_TABS],
		},
	};
}

export function registerWebClientSidebarActionHandlers(
	client: WsClient,
	runtime: SidebarActionRuntime,
): () => void {
	const unsubscribeGetState = client.registerInboundRequestHandler(
		WEBCLIENT_SIDEBAR_GET_STATE,
		(payload) => {
			const record = requireRecord(payload);
			if (Object.keys(record).length > 0) {
				invalidRequest("webclient.sidebar.getState payload must be empty");
			}
			return readSidebarState(runtime);
		},
	);

	const unsubscribeSetState = client.registerInboundRequestHandler(
		WEBCLIENT_SIDEBAR_SET_STATE,
		(payload) => {
			const record = requireRecord(payload);
			requireExactKeys(record, ["sidebar", "open", "tab"]);
			const sidebar = record.sidebar;
			if (sidebar !== "left" && sidebar !== "right") {
				invalidRequest("sidebar must be left or right");
			}
			if (typeof record.open !== "boolean") {
				invalidRequest("open must be a boolean");
			}
			const open = record.open;
			const hasTab = Object.prototype.hasOwnProperty.call(record, "tab");
			if (sidebar === "left" && hasTab) {
				invalidRequest("tab is not supported for the left sidebar");
			}
			if (!open && hasTab) {
				invalidRequest("tab is not supported when closing a sidebar");
			}
			if (hasTab && !isSupportedRightSidebarTab(record.tab)) {
				invalidRequest("tab must be overview, btw, or debug");
			}

			const before = readSidebarState(runtime);
			if (!before.available[sidebar]) {
				unsupportedInCurrentView(
					`${sidebar} sidebar is unavailable in the current view`,
				);
			}

			let applied = false;
			if (sidebar === "left") {
				applied = before.left.open !== open;
				if (applied) {
					runtime.dispatch({
						type: "SET_LEFT_DRAWER_OPEN",
						open,
					});
				}
			} else if (!open) {
				applied = before.right.open;
				if (applied) {
					runtime.dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
				}
			} else {
				const requestedTab = hasTab
					? (record.tab as SupportedRightSidebarTab)
					: isSupportedRightSidebarTab(before.right.tab)
						? before.right.tab
						: "overview";
				applied =
					!before.right.open || before.right.tab !== requestedTab;
				if (applied) {
					runtime.dispatch({
						type: "OPEN_RIGHT_SIDEBAR",
						tab: requestedTab,
					});
				}
			}

			const after = readSidebarState(runtime);
			return {
				applied,
				sidebar,
				...(sidebar === "left"
					? { open: after.left.open }
					: {
							open: after.right.open,
							tab: after.right.tab,
						}),
			};
		},
	);

	const unsubscribeOpenUrl = client.registerInboundRequestHandler(
		WEBCLIENT_SIDEBAR_OPEN_URL,
		(payload) => {
			const record = requireRecord(payload);
			requireExactKeys(record, ["url", "title"]);
			const before = readSidebarState(runtime);
			if (!before.available.right) {
				unsupportedInCurrentView(
					"right sidebar is unavailable in the current view",
				);
			}

			const url = normalizeWebPreviewUrl(record.url);
			const stateBefore = runtime.getState();
			const existingPreview = stateBefore.webPreviews.find(
				(preview) => preview.url === url,
			);
			const fallbackTitle =
				existingPreview?.title || new URL(url).hostname || url;
			const title = normalizeWebPreviewTitle(record.title, fallbackTitle);
			const applied =
				!stateBefore.rightSidebarOpen ||
				stateBefore.rightSidebarOpenTab !== "web" ||
				stateBefore.activeWebPreviewUrl !== url ||
				existingPreview?.title !== title;

			if (applied) {
				runtime.dispatch({
					type: "OPEN_RIGHT_SIDEBAR",
					tab: "web",
					webPreview: {
						title,
						url,
					},
				});
			}

			const stateAfter = runtime.getState();
			const finalPreview = stateAfter.webPreviews.find(
				(preview) => preview.url === url,
			);
			return {
				applied,
				sidebar: "right",
				open: stateAfter.rightSidebarOpen,
				tab: stateAfter.rightSidebarOpenTab,
				url: finalPreview?.url || url,
				title: finalPreview?.title || title,
			};
		},
	);

	return () => {
		unsubscribeOpenUrl();
		unsubscribeSetState();
		unsubscribeGetState();
	};
}

export function useWebClientActionRuntime(): void {
	const { dispatch, state, stateRef } = useAppContext();

	useEffect(() => {
		if (isGatewayBackendMode()) {
			return;
		}
		const accessToken = String(state.accessToken || "").trim();
		const appMode = isAppMode();
		if (appMode && !accessToken) {
			return;
		}
		const syncAccessToken = (token: string) => {
			const normalized = String(token || "").trim();
			if (normalized && normalized !== stateRef.current.accessToken) {
				dispatch({ type: "SET_ACCESS_TOKEN", token: normalized });
			}
			return normalized;
		};
		const client = initWsClient({
			accessToken,
			allowAnonymous: !appMode,
			resolveAccessToken: async (reason) =>
				syncAccessToken(await ensureAccessToken(reason)),
			onAccessTokenChange: syncAccessToken,
		});
		void client.connect().catch(() => undefined);
	}, [dispatch, state.accessToken, stateRef]);

	useEffect(() => {
		if (isGatewayBackendMode()) {
			return;
		}
		return () => destroyWsClient();
	}, []);

	useEffect(() => {
		if (isGatewayBackendMode()) {
			return;
		}
		let unregisterActions: (() => void) | undefined;
		const unsubscribeClient = subscribeWsClient((client) => {
			unregisterActions?.();
			unregisterActions = client
				? registerWebClientSidebarActionHandlers(client, {
						dispatch,
						getState: () => stateRef.current,
					})
				: undefined;
		});
		return () => {
			unregisterActions?.();
			unsubscribeClient();
		};
	}, [dispatch, stateRef]);
}
