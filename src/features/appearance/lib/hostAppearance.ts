import { parseDesktopAppearance, type DesktopAppearanceBridge, type DesktopAppearanceSnapshot } from "@/shared/contracts/desktopAppearance";

export const HOST_APPEARANCE_TIMEOUT = 2000;

export function readAppearanceBridge(): DesktopAppearanceBridge | null {
  const value = (window as Window & { __AGENT_WEBCLIENT_APPEARANCE__?: DesktopAppearanceBridge }).__AGENT_WEBCLIENT_APPEARANCE__;
  return value?.version === 1 && typeof value.getSnapshot === "function" && typeof value.subscribe === "function" ? value : null;
}

// Not a navigation protocol. The host is discovered independently, including
// when it is exposed after React, replaced, or revoked while the guest is hidden.
export function observeHostAppearance(onChange: (snapshot: DesktopAppearanceSnapshot | null) => void,
  readBridge = readAppearanceBridge) {
  let active = true;
  let bridge: DesktopAppearanceBridge | null = null;
  let unsubscribe: (() => void) | undefined;
  let request = 0;
  let revision = 0;
  let canonical = "";
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const receive = (value: unknown) => {
    const next = parseDesktopAppearance(value);
    if (!next) { onChange(null); return; }
    const identity = JSON.stringify({ ...next, tokens: Object.fromEntries(Object.entries(next.tokens).sort()) });
    if (next.revision < revision || (next.revision === revision && canonical !== identity)) return;
    revision = next.revision;
    canonical = identity;
    onChange(next);
  };
  const cancelRequest = () => { request++; clearTimeout(timeout); };
  const refresh = () => {
    cancelRequest();
    if (!bridge) return;
    const sequence = request;
    timeout = setTimeout(() => {
      if (active && sequence === request) { request++; onChange(null); }
    }, HOST_APPEARANCE_TIMEOUT);
    Promise.resolve().then(() => bridge?.getSnapshot()).then((value) => {
      if (!active || sequence !== request) return;
      clearTimeout(timeout);
      receive(value);
    }, () => {
      if (!active || sequence !== request) return;
      clearTimeout(timeout);
      onChange(null);
    });
  };
  const discover = () => {
    let next: DesktopAppearanceBridge | null = null;
    try { next = readBridge(); } catch { /* inaccessible bridge */ }
    if (next === bridge) return;
    cancelRequest();
    try { unsubscribe?.(); } catch { /* host disposed */ }
    unsubscribe = undefined;
    bridge = next;
    onChange(null);
    if (!next) return;
    try {
      const observed = next;
      unsubscribe = next.subscribe((value) => {
        if (!active || observed !== bridge) return;
        cancelRequest();
        receive(value);
      });
      if (typeof unsubscribe !== "function") throw new Error("Invalid appearance subscription");
      refresh();
    } catch { bridge = null; onChange(null); }
  };
  const resume = () => {
    if (document.visibilityState === "hidden") return;
    discover();
    refresh();
  };
  discover();
  const discoveryTimer = setInterval(discover, 1000);
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("pageshow", resume);
  return () => {
    active = false;
    cancelRequest();
    clearInterval(discoveryTimer);
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("pageshow", resume);
    try { unsubscribe?.(); } catch { /* host disposed */ }
  };
}
