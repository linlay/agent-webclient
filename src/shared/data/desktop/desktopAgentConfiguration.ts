import {
  hasDesktopHostBridge,
  isDesktopHostMessageEvent,
  postDesktopHostMessage,
} from "@/shared/data/desktop/desktopHostBridge";

export const DESKTOP_OPEN_AGENT_CONFIGURATION_REQUEST_TYPE =
  "desktop:agent-webclient:agent-configuration:open";
export const DESKTOP_OPEN_AGENT_CONFIGURATION_RESPONSE_TYPE =
  "desktop:agent-webclient:agent-configuration:opened";

export function openDesktopAgentConfiguration(agentKey: string): Promise<void> {
  if (!agentKey || !hasDesktopHostBridge()) {
    return Promise.reject(new Error("Desktop Agent configuration navigation is unavailable"));
  }
  return new Promise<void>((resolve, reject) => {
    const requestId = `agent_configuration_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);
    };
    const handleMessage = (event: MessageEvent) => {
      if (!isDesktopHostMessageEvent(event)) return;
      const payload = event.data;
      if (payload?.type !== DESKTOP_OPEN_AGENT_CONFIGURATION_RESPONSE_TYPE ||
          payload.requestId !== requestId) return;
      cleanup();
      if (payload.ok === true) resolve();
      else reject(new Error("Desktop Agent configuration navigation failed"));
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Desktop Agent configuration navigation timed out"));
    }, 5_000);
    window.addEventListener("message", handleMessage);
    if (!postDesktopHostMessage({
      type: DESKTOP_OPEN_AGENT_CONFIGURATION_REQUEST_TYPE,
      requestId,
      agentKey,
    })) {
      cleanup();
      reject(new Error("Desktop Agent configuration request failed"));
    }
  });
}
