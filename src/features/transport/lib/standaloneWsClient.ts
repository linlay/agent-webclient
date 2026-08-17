import { ensureAccessToken, getCurrentAccessToken } from "@/shared/data/api/client";
import { isGatewayBackendMode } from "@/shared/config/backendMode";
import {
	destroyWsClient,
	getWsClient,
	initWsClient,
	updateCurrentWsClientOptions,
} from "@/features/transport/lib/wsClientSingleton";
import type {
  WsAccessTokenRefreshReason,
  WsClient,
} from "@/features/transport/lib/wsClient";

async function resolveStandaloneAccessToken(
  reason: WsAccessTokenRefreshReason = "missing",
): Promise<string> {
  if (isGatewayBackendMode()) return "";
  let token = String(getCurrentAccessToken() || "").trim();
  if (!token || reason === "unauthorized") {
    token = String(await ensureAccessToken(reason)).trim();
  }
  return token;
}

export async function ensureStandaloneWsClient(): Promise<WsClient> {
  const accessToken = await resolveStandaloneAccessToken();
  const options = {
    accessToken,
    allowAnonymous: isGatewayBackendMode() || !accessToken,
    resolveAccessToken: isGatewayBackendMode()
      ? undefined
      : resolveStandaloneAccessToken,
  };
  const current = getWsClient();
  if (current) {
    return updateCurrentWsClientOptions(options) || current;
  }
  return initWsClient(options);
}

/** Infrastructure-only compatibility access for legacy runtime tests. */
export const getStandaloneWsClient = getWsClient;
export const initializeStandaloneWsClient = initWsClient;
export const destroyStandaloneWsClient = destroyWsClient;
