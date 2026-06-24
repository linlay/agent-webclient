import type { ApiResponse } from "@/shared/api/apiClient";
import {
	ensureAccessToken,
	getCurrentAccessToken,
} from "@/shared/api/apiClient";
import { isWsTransportError } from "@/features/transport/lib/wsClient";
import {
	getWsClient,
	getWsClientAccessToken,
	initWsClient,
} from "@/features/transport/lib/wsClientSingleton";
import type { TransportMode as TransportModeValue } from "@/features/transport/lib/transportMode";
import { isAppMode } from "@/shared/utils/routing";

type WsRequestClient = NonNullable<ReturnType<typeof getWsClient>>;
type TokenRefreshReason = Parameters<typeof ensureAccessToken>[0];

export interface TransportRequestOptions<T> {
	fallback: () => Promise<ApiResponse<T>>;
	fallbackOnConnectFailure?: boolean;
	fallbackOnRequestFailure?: boolean;
}

export interface TransportClient {
	request<T>(
		type: string,
		payload: unknown,
		options: TransportRequestOptions<T>,
	): Promise<ApiResponse<T>>;
}

export function createTransportClient(input: {
	getMode: () => TransportModeValue;
}): TransportClient {
	return {
		request: (type, payload, options) =>
			routeTransportRequest(input.getMode, type, payload, options),
	};
}

async function resolveWsAccessToken(
	reason: TokenRefreshReason = "missing",
): Promise<string> {
	let accessToken = String(getCurrentAccessToken() || "").trim();
	if (!accessToken || reason === "unauthorized") {
		accessToken = String(await ensureAccessToken(reason)).trim();
	}
	return accessToken;
}

function resolveWsClient(accessToken: string): WsRequestClient {
	const currentClient = getWsClient();
	const appMode = isAppMode();
	const wsClient =
		currentClient == null || getWsClientAccessToken() !== accessToken
			? initWsClient({
				accessToken,
				allowAnonymous: !appMode,
				resolveAccessToken: resolveWsAccessToken,
			})
			: currentClient;

	if (
		currentClient != null &&
		getWsClientAccessToken() === accessToken &&
		typeof wsClient.updateOptions === "function"
	) {
		wsClient.updateOptions({
			accessToken,
			allowAnonymous: !appMode,
			resolveAccessToken: resolveWsAccessToken,
		});
	}

	return wsClient;
}

function resolveActiveWsClient(
	accessToken: string,
	wsClient: WsRequestClient,
): { accessToken: string; wsClient: WsRequestClient } {
	const currentClient = getWsClient();
	const currentAccessToken = String(getWsClientAccessToken() || "").trim();
	if (currentClient === wsClient) {
		return {
			accessToken: currentAccessToken || accessToken,
			wsClient,
		};
	}

	return {
		accessToken,
		wsClient: resolveWsClient(accessToken),
	};
}

async function routeTransportRequest<T>(
	getMode: () => TransportModeValue,
	type: string,
	payload: unknown,
	options: TransportRequestOptions<T>,
): Promise<ApiResponse<T>> {
	const { fallback } = options;
	if (getMode() !== "ws") {
		return fallback();
	}
	let accessToken = await resolveWsAccessToken("missing");
	let wsClient = resolveWsClient(accessToken);
	const syncActiveWsClient = () => {
		const active = resolveActiveWsClient(accessToken, wsClient);
		accessToken = active.accessToken;
		wsClient = active.wsClient;
	};
	const connectActiveWsClient = async () => {
		syncActiveWsClient();
		const connectingClient = wsClient;
		await connectingClient.connect();
		syncActiveWsClient();
		if (wsClient !== connectingClient) {
			await wsClient.connect();
			syncActiveWsClient();
		}
	};

	try {
		await connectActiveWsClient();
	} catch (error) {
		const refreshedToken = await resolveWsAccessToken("unauthorized");
		if (refreshedToken && refreshedToken !== accessToken) {
			accessToken = refreshedToken;
			wsClient = resolveWsClient(accessToken);
			try {
				await connectActiveWsClient();
			} catch (refreshError) {
				if (options.fallbackOnConnectFailure === false) {
					throw refreshError;
				}
				return fallback();
			}
		} else {
			if (options.fallbackOnConnectFailure === false) {
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, 200));
			try {
				await connectActiveWsClient();
			} catch {
				return fallback();
			}
		}
	}

	try {
		syncActiveWsClient();
		return await wsClient.request<T>({ type, payload });
	} catch (error) {
		if (
			options.fallbackOnRequestFailure === false ||
			!isWsTransportError(error)
		) {
			throw error;
		}
		return fallback();
	}
}
