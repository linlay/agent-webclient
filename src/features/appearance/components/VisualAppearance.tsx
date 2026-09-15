import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { SkinVisualContext } from "@/shared/ui/SkinVisual";
import { isSkinVisualDataUrl, skinVisualStyleVariables, type AgentWebclientVisualBridge, type AgentWebclientVisualSnapshot, type SkinVisualSlot } from "@/shared/contracts/generated/agentWebclientBridge";
import { observeHostVisuals } from "../lib/hostVisuals";
import type { AppearanceController, AppearanceSnapshot } from "../lib/controller";
export function VisualAppearance({ controller, appearance, children }: { controller: AppearanceController; appearance: AppearanceSnapshot; children: React.ReactNode }) {
  const [host, setHost] = useState<{ snapshot: AgentWebclientVisualSnapshot; bridge: AgentWebclientVisualBridge } | null>(null);
  useEffect(() => appearance.desktop ? observeHostVisuals((snapshot, bridge) => setHost(snapshot && bridge ? { snapshot, bridge } : null)) : undefined, [appearance.desktop]);
  const local = controller.getLocalVisuals();
  const visuals = appearance.desktop ? host?.snapshot.visuals : local;
  const identity = appearance.desktop ? host?.snapshot.resourceSet ?? "unavailable" : `${appearance.selectedSkinId}:${appearance.resolvedTheme}:${JSON.stringify(local)}`;
  const bridge = host?.bridge, resourceSet = host?.snapshot.resourceSet;
  const value = useMemo(() => {
    const cache = new Map<SkinVisualSlot, Promise<string | null>>();
    return { identity, getAsset(slot: SkinVisualSlot) {
      if (!visuals?.images[slot]) return Promise.resolve(null);
      if (!cache.has(slot)) cache.set(slot, appearance.desktop
        ? bridge && resourceSet ? bridge.getAsset(resourceSet, slot).then(data => isSkinVisualDataUrl(data) ? data : null) : Promise.resolve(null)
        : new Promise(resolve => {
          const blob = controller.getLocalVisualAsset(visuals.images[slot]!);
          if (!blob) { resolve(null); return; }
          const reader = new FileReader(); reader.onload = () => resolve(isSkinVisualDataUrl(reader.result) ? reader.result : null); reader.onerror = () => resolve(null); reader.readAsDataURL(blob);
        }));
      return cache.get(slot)!;
    } };
  }, [identity, bridge, resourceSet, appearance.desktop, controller]);
  useLayoutEffect(() => {
    const root = document.documentElement, values = skinVisualStyleVariables(visuals?.styles ?? {});
    const previous = Object.fromEntries(Object.keys(values).map(key => [key, root.style.getPropertyValue(key)]));
    for (const [key, val] of Object.entries(values)) root.style.setProperty(key, val);
    return () => { for (const [key, val] of Object.entries(previous)) { if (val) root.style.setProperty(key, val); else root.style.removeProperty(key); } };
  }, [visuals]);
  return <SkinVisualContext.Provider value={value}>{children}</SkinVisualContext.Provider>;
}
