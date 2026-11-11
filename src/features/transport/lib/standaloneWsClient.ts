import { isEmbedMode } from "@/shared/config/embed";
import { ensureAccessToken, getCurrentAccessToken } from "@/shared/data/api/http";
import { usesGatewaySession } from "@/shared/config/authMode";
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
  if (isEmbedMode()) return ensureAccessToken(reason);
  if (usesGatewaySession()) return "";
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
    allowAnonymous: usesGatewaySession() || (!isEmbedMode() && !accessToken),
    resolveAccessToken: usesGatewaySession()
      ? undefined
      : resolveStandaloneAccessToken,
  };
  const current = getWsClient();
  if (current) {
    return updateCurrentWsClientOptions(options) || current;
  }
  return initWsClient(options);
}

export const destroyStandaloneWsClient = destroyWsClient;
