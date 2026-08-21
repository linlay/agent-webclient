import type { ApiResponse } from "@/shared/data/api/client";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { ensureStandaloneWsClient } from "@/features/transport/lib/standaloneWsClient";
import type { PlatformFrameClient } from "@/features/transport/lib/platformFrameClient";
import { DesktopFramePortClosedError } from "@/features/transport/lib/desktopFramePortDriver";
import { getDesktopPlatformFrameClient } from "@/features/transport/lib/desktopPlatformFrameClientRegistry";

async function resolveDataRequestClient(): Promise<PlatformFrameClient> {
  if (!isDesktopAppMode()) {
    return ensureStandaloneWsClient();
  }

  const client = getDesktopPlatformFrameClient();
  if (!client) {
    throw new DesktopFramePortClosedError(
      "Desktop Platform Frame Port is not initialized",
    );
  }
  return client;
}

/**
 * Send a strict request/response call over the active Platform frame client.
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
