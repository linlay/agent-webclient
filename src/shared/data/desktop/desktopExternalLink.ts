import {
  hasDesktopHostBridge,
  isDesktopHostMessageEvent,
  postDesktopHostMessage,
} from "./desktopHostBridge";

const REQUEST_TYPE = "desktop:agent-webclient:external-link:open";
const RESPONSE_TYPE = "desktop:agent-webclient:external-link:result";

type DesktopExternalLinkResult = "accepted" | "unsupported" | "unavailable";

export function openExternalLinkInDesktop(url: string): Promise<DesktopExternalLinkResult> {
  if (!hasDesktopHostBridge()) return Promise.resolve("unavailable");

  return new Promise((resolve) => {
    const requestId = `desktop_external_link_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const finish = (result: DesktopExternalLinkResult) => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(result);
    };
    const onMessage = (event: MessageEvent) => {
      const reply = event.data;
      if (!isDesktopHostMessageEvent(event) || reply?.type !== RESPONSE_TYPE || reply.requestId !== requestId) {
        return;
      }
      if (reply.ok === true) {
        finish("accepted");
      } else {
        finish(reply.code === "unsupported" ? "unsupported" : "unavailable");
      }
    };
    const timeout = window.setTimeout(() => finish("unavailable"), 5_000);
    window.addEventListener("message", onMessage);
    if (!postDesktopHostMessage({ type: REQUEST_TYPE, requestId, url })) finish("unavailable");
  });
}
