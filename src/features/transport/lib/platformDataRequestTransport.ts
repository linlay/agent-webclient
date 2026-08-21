import type { ApiResponse } from "@/shared/data/api/client";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { ensureStandaloneWsClient } from "@/features/transport/lib/standaloneWsClient";
import {
  WsClientDisconnectedError,
  type WsClient,
} from "@/features/transport/lib/wsClient";
import { getWsClient } from "@/features/transport/lib/wsClientSingleton";

async function resolveDataRequestClient(): Promise<WsClient> {
  if (!isDesktopAppMode()) {
    return ensureStandaloneWsClient();
  }

  const client = getWsClient();
  if (!client) {
    throw new WsClientDisconnectedError(
      "Desktop WebSocket transport is not initialized",
    );
  }
  return client;
}

/**
 * Send a strict request/response call over the shared Platform WebSocket.
 * Transport failures are deliberately propagated; callers must not retry via HTTP.
 */
export async function requestPlatformData<T>(
  type: string,
  payload: unknown,
): Promise<ApiResponse<T>> {
  const client = await resolveDataRequestClient();
  await client.connect();
  return client.request<T>({ type, payload });
}
