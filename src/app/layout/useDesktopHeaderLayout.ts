import { useEffect, useState } from "react";
import {
  AGENT_WEBCLIENT_HEADER_LAYOUT_GLOBAL,
  parseAgentWebclientHeaderLayoutSnapshot,
  readAgentWebclientHeaderLayoutBootstrap,
  type AgentWebclientHeaderLayout,
  type AgentWebclientHeaderLayoutBridge,
} from "@/shared/contracts/generated/agentWebclientBridge";

const EXPANDED_LAYOUT: AgentWebclientHeaderLayout = { sidebarCollapsed: false, headerLeftInset: 0 };

/** Desktop owns this layout. It never participates in Chat/Run navigation. */
export function useDesktopHeaderLayout(enabled: boolean): AgentWebclientHeaderLayout {
  const [layout, setLayout] = useState<AgentWebclientHeaderLayout | null>(() =>
    enabled && typeof window !== "undefined" ? readAgentWebclientHeaderLayoutBootstrap(window.location.search) : null);
  useEffect(() => {
    if (!enabled) { setLayout(null); return; }
    const bridge = (window as Window & { [AGENT_WEBCLIENT_HEADER_LAYOUT_GLOBAL]?: AgentWebclientHeaderLayoutBridge })[AGENT_WEBCLIENT_HEADER_LAYOUT_GLOBAL];
    if (!bridge || bridge.version !== "1.0" || typeof bridge.getSnapshot !== "function" || typeof bridge.subscribe !== "function") return;
    let revision = -1;
    let signature = "";
    let active = true;
    const receive = (value: unknown) => {
      if (!active) return;
      if (value === null) { setLayout(null); return; }
      const snapshot = parseAgentWebclientHeaderLayoutSnapshot(value);
      if (!snapshot || snapshot.revision < revision ||
        (snapshot.revision === revision && JSON.stringify(snapshot) !== signature)) return;
      revision = snapshot.revision;
      signature = JSON.stringify(snapshot);
      setLayout({ sidebarCollapsed: snapshot.sidebarCollapsed, headerLeftInset: snapshot.headerLeftInset });
    };
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = bridge.subscribe(receive);
      receive(bridge.getSnapshot());
    } catch { setLayout(null); }
    return () => { active = false; unsubscribe?.(); };
  }, [enabled]);
  return enabled ? layout ?? EXPANDED_LAYOUT : EXPANDED_LAYOUT;
}
