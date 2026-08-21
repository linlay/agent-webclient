import type { PlatformFrameClient } from "@/features/transport/lib/platformFrameClient";

let currentDesktopPlatformFrameClient: PlatformFrameClient | null = null;

export function registerDesktopPlatformFrameClient(
  client: PlatformFrameClient,
): () => void {
  currentDesktopPlatformFrameClient = client;
  return () => {
    if (currentDesktopPlatformFrameClient === client) {
      currentDesktopPlatformFrameClient = null;
    }
  };
}

export function getDesktopPlatformFrameClient(): PlatformFrameClient | null {
  return currentDesktopPlatformFrameClient;
}
