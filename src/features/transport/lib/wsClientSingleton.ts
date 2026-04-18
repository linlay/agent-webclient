import { WsClient, type WsClientOptions } from "@/features/transport/lib/wsClient";

let wsClient: WsClient | null = null;
let wsClientAccessToken = "";

export function initWsClient(options: WsClientOptions = {}): WsClient {
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
	return wsClient;
}

export function getWsClientAccessToken(): string {
	return wsClientAccessToken;
}

export function destroyWsClient(): void {
	if (wsClient) {
		wsClient.disconnect();
	}
	wsClient = null;
	wsClientAccessToken = "";
}
