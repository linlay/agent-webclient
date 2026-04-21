import { WsClient, type WsClientOptions } from "@/features/transport/lib/wsClient";

let wsClient: WsClient | null = null;
let wsClientAccessToken = "";
let pendingDestroyTimer: ReturnType<typeof setTimeout> | null = null;

function clearPendingDestroy(): void {
	if (!pendingDestroyTimer) {
		return;
	}
	clearTimeout(pendingDestroyTimer);
	pendingDestroyTimer = null;
}

export function initWsClient(options: WsClientOptions = {}): WsClient {
	clearPendingDestroy();
	const accessToken = String(options.accessToken || "").trim();

	if (wsClient && wsClientAccessToken === accessToken) {
		wsClient.updateOptions(options);
		return wsClient;
	}

	if (wsClient) {
		wsClient.disconnect();
	}

	wsClient = new WsClient(options);
	wsClientAccessToken = accessToken;
	return wsClient;
}

export function getWsClient(): WsClient | null {
	clearPendingDestroy();
	return wsClient;
}

export function getWsClientAccessToken(): string {
	return wsClientAccessToken;
}

export function destroyWsClient(): void {
	clearPendingDestroy();
	if (wsClient) {
		wsClient.disconnect();
	}
	wsClient = null;
	wsClientAccessToken = "";
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
