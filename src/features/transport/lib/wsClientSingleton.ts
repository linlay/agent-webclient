import { WsClient, type WsClientOptions } from "@/features/transport/lib/wsClient";

let wsClient: WsClient | null = null;
let wsClientAccessToken = "";
let pendingDestroyTimer: ReturnType<typeof setTimeout> | null = null;
const wsClientListeners = new Set<(client: WsClient | null) => void>();

function notifyWsClientListeners(): void {
	for (const listener of wsClientListeners) {
		listener(wsClient);
	}
}

function clearPendingDestroy(): void {
	if (!pendingDestroyTimer) {
		return;
	}
	clearTimeout(pendingDestroyTimer);
	pendingDestroyTimer = null;
}

function withAccessTokenSync(options: WsClientOptions): WsClientOptions {
	const onAccessTokenChange = options.onAccessTokenChange;
	return {
		...options,
		onAccessTokenChange: (accessToken) => {
			wsClientAccessToken = String(accessToken || "").trim();
			onAccessTokenChange?.(accessToken);
		},
	};
}

export function initWsClient(options: WsClientOptions = {}): WsClient {
	clearPendingDestroy();
	const accessToken = String(options.accessToken || "").trim();
	const syncedOptions = withAccessTokenSync(options);

	if (wsClient && wsClientAccessToken === accessToken) {
		wsClient.updateOptions(syncedOptions);
		return wsClient;
	}

	if (wsClient) {
		wsClient.dispose();
	}

	wsClient = new WsClient(syncedOptions);
	wsClientAccessToken = accessToken;
	notifyWsClientListeners();
	return wsClient;
}

export function updateCurrentWsClientOptions(
	options: WsClientOptions = {},
): WsClient | null {
	clearPendingDestroy();
	if (!wsClient) {
		return null;
	}
	const syncedOptions = withAccessTokenSync(options);
	wsClient.updateOptions(syncedOptions);
	if (options.accessToken !== undefined) {
		wsClientAccessToken = String(options.accessToken || "").trim();
	}
	return wsClient;
}

export function getWsClient(): WsClient | null {
	clearPendingDestroy();
	return wsClient;
}

export function getWsClientAccessToken(): string {
	return wsClientAccessToken;
}

export function subscribeWsClient(
	listener: (client: WsClient | null) => void,
): () => void {
	clearPendingDestroy();
	wsClientListeners.add(listener);
	listener(wsClient);
	return () => {
		wsClientListeners.delete(listener);
	};
}

export function destroyWsClient(): void {
	clearPendingDestroy();
	if (wsClient) {
		wsClient.dispose();
	}
	wsClient = null;
	wsClientAccessToken = "";
	notifyWsClientListeners();
}

export function scheduleDestroyWsClient(): void {
	clearPendingDestroy();
	const clientToDestroy = wsClient;
	const accessTokenToDestroy = wsClientAccessToken;

	if (!clientToDestroy) {
		return;
	}

	pendingDestroyTimer = setTimeout(() => {
		pendingDestroyTimer = null;
		if (
			wsClient !== clientToDestroy
			|| wsClientAccessToken !== accessTokenToDestroy
		) {
			return;
		}
		destroyWsClient();
	}, 0);
}
