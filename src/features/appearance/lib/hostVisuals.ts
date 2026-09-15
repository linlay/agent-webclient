import { AGENT_WEBCLIENT_VISUALS_GLOBAL, parseAgentWebclientVisualSnapshot,
  type AgentWebclientVisualBridge, type AgentWebclientVisualSnapshot } from "@/shared/contracts/generated/agentWebclientBridge";
export function observeHostVisuals(onChange: (snapshot: AgentWebclientVisualSnapshot | null, bridge: AgentWebclientVisualBridge | null) => void) {
  let active = true, sequence = 0, revision = 0, signature = "";
  let bridge: AgentWebclientVisualBridge | null = null, unsubscribe: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const receive = (raw: unknown) => {
    const value = parseAgentWebclientVisualSnapshot(raw);
    if (value && (value.revision < revision || (value.revision === revision && JSON.stringify(value) !== signature))) return;
    if (value) { revision = value.revision; signature = JSON.stringify(value); }
    onChange(value, value ? bridge : null);
  };
  const refresh = () => {
    const current = ++sequence; clearTimeout(timeout);
    if (!bridge) return;
    timeout = setTimeout(() => { if (active && sequence === current) { sequence++; receive(null); } }, 2000);
    Promise.resolve().then(() => bridge?.getSnapshot()).then(value => {
      if (!active || current !== sequence) return; clearTimeout(timeout); receive(value);
    }, () => { if (active && current === sequence) { clearTimeout(timeout); receive(null); } });
  };
  const discover = () => {
    const candidate = (window as Window & { [AGENT_WEBCLIENT_VISUALS_GLOBAL]?: AgentWebclientVisualBridge })[AGENT_WEBCLIENT_VISUALS_GLOBAL];
    const next = candidate?.version === "1.1" && typeof candidate.getAsset === "function" && typeof candidate.subscribe === "function" && typeof candidate.getSnapshot === "function" ? candidate : null;
    if (next === bridge) return;
    sequence++; clearTimeout(timeout); unsubscribe?.(); bridge = next; receive(null);
    if (bridge) {
      const observed = bridge;
      try { unsubscribe = bridge.subscribe(value => { if (!active || bridge !== observed) return; sequence++; clearTimeout(timeout); receive(value); }); refresh(); }
      catch { bridge = null; receive(null); }
    }
  };
  const resume = () => { discover(); if (document.visibilityState !== "hidden") refresh(); };
  discover(); const timer = setInterval(discover, 1000);
  window.addEventListener("pageshow", resume); document.addEventListener("visibilitychange", resume);
  return () => { active = false; sequence++; clearTimeout(timeout); clearInterval(timer); unsubscribe?.(); window.removeEventListener("pageshow", resume); document.removeEventListener("visibilitychange", resume); };
}
