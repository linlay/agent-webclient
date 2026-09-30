import { hasDesktopHostBridge, isDesktopHostMessageEvent, postDesktopHostMessage } from "./desktopHostBridge";

export const DESKTOP_OPEN_CONNECTOR_CONFIGURATION_REQUEST_TYPE = "desktop:agent-webclient:connector-configuration:open";
export const DESKTOP_OPEN_CONNECTOR_CONFIGURATION_RESPONSE_TYPE = "desktop:agent-webclient:connector-configuration:opened";

/** The host resolves installed IDs and builds the destination itself. No URL or secret is sent. */
export function openDesktopConnectorConfiguration(connectorId: string): Promise<void> {
  if (!connectorId || !hasDesktopHostBridge()) return Promise.reject(new Error("Desktop connector configuration navigation is unavailable"));
  return new Promise<void>((resolve, reject) => {
    const requestId = `connector_configuration_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const cleanup = () => { window.clearTimeout(timeout); window.removeEventListener("message", handleMessage); };
    const handleMessage = (event: MessageEvent) => {
      if (!isDesktopHostMessageEvent(event)) return;
      const payload = event.data;
      if (payload?.type !== DESKTOP_OPEN_CONNECTOR_CONFIGURATION_RESPONSE_TYPE || payload.requestId !== requestId) return;
      cleanup();
      if (payload.ok === true) resolve();
      else reject(new Error("Desktop connector configuration navigation failed"));
    };
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error("Desktop connector configuration navigation timed out")); }, 5_000);
    window.addEventListener("message", handleMessage);
    if (!postDesktopHostMessage({ type: DESKTOP_OPEN_CONNECTOR_CONFIGURATION_REQUEST_TYPE, requestId, connectorId })) {
      cleanup(); reject(new Error("Desktop connector configuration request failed"));
    }
  });
}
