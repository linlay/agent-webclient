import React, { createContext, useContext, useEffect, useState } from "react";
import type { SkinVisualSlot } from "@/shared/contracts/generated/agentWebclientBridge";
export const SkinVisualContext = createContext<{ identity: string; getAsset: (slot: SkinVisualSlot) => Promise<string | null> } | null>(null);
export function SkinVisual({ slot, children, className, style, size = 16 }: { size?: number; slot: SkinVisualSlot; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const context = useContext(SkinVisualContext);
  const key = `${context?.identity}:${slot}`;
  const [image, setImage] = useState<{ key: string; src: string } | null>(null);
  const [failed, setFailed] = useState<string>();
  useEffect(() => {
    let active = true;
    if (context) void context.getAsset(slot).then(src => { if (active) setImage(src ? { key, src } : null); }, () => { if (active) setImage(null); });
    return () => { active = false; };
  }, [context, slot, key]);
  return image?.key === key && failed !== image.src ? <img src={image.src} alt="" aria-hidden="true" draggable={false}
    className={className} style={{ width: size, height: size, flexShrink: 0, objectFit: "contain", verticalAlign: "middle", ...style }} onError={() => setFailed(image.src)} /> : <>{children}</>;
}
