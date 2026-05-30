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
		wsClient.dispose();
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
