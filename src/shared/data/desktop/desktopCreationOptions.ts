import { hasDesktopHostBridge, isDesktopHostMessageEvent, postDesktopHostMessage } from "./desktopHostBridge";
import type { AgentCreationOptionsResponse } from "../api/dto/agents";

export function getDesktopCreationOptions(): Promise<AgentCreationOptionsResponse> | null {
  if (!hasDesktopHostBridge()) return null;
  return new Promise((resolve, reject) => {
    const requestId = `creation_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const cleanup = () => { clearTimeout(timer); window.removeEventListener("message", receive); };
    const receive = (event: MessageEvent) => {
      if (!isDesktopHostMessageEvent(event) || event.data?.type !== "desktop:agent-webclient:creation:options:response" || event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.ok && event.data.options) resolve(event.data.options);
      else reject(new Error(event.data.message || "Creation options unavailable"));
    };
    const timer = window.setTimeout(() => { cleanup(); reject(new Error("Creation options timed out")); }, 15000);
    window.addEventListener("message", receive);
    if (!postDesktopHostMessage({ type: "desktop:agent-webclient:creation:options", requestId })) {
      cleanup(); reject(new Error("Creation options bridge unavailable"));
    }
  });
}
