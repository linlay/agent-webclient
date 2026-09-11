import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

const useBrowserLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

export interface ConversationPresentation {
  targetChatId: string;
  blocked: boolean;
  busy: boolean;
  error: string;
  phase: "visible" | "exiting";
  restorationReady: boolean;
  onTransitionEnd: (event: React.TransitionEvent<HTMLDivElement>) => void;
}

export const ConversationSurfaceContext = createContext<ConversationPresentation | null>(null);

/** One clock for every region of a conversation, including the exit animation. */
export function useConversationPresentationClock(input: {
  targetChatId: string; identity: string; pending: boolean; error: string; background: boolean;
}, enabled = true): ConversationPresentation {
  const { targetChatId, identity, pending, error, background } = input;
  const [presentation, setPresentation] = useState<{ identity: string; phase: "visible" | "exiting" } | null>(null);
  const shown = useRef({ identity: "", at: 0 });

  useBrowserLayoutEffect(() => {
    if (!enabled) return;
    if (error || pending) {
      if (shown.current.identity !== identity) shown.current = { identity, at: performance.now() };
      setPresentation(current => current?.identity === identity && current.phase === "visible"
        ? current : { identity, phase: "visible" });
      return;
    }
    if (!shown.current.identity) return;
    if (!targetChatId || background) {
      shown.current = { identity: "", at: 0 };
      setPresentation(null);
      return;
    }
    const activeIdentity = shown.current.identity;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (shown.current.identity !== activeIdentity) return;
      shown.current = { identity: "", at: 0 };
      setPresentation(null);
    };
    const beginExit = () => {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        finish();
      } else {
        setPresentation({ identity: activeIdentity, phase: "exiting" });
        fadeTimer = setTimeout(finish, 80);
      }
    };
    const remaining = Math.max(0, 160 - (performance.now() - shown.current.at));
    const holdTimer = remaining > 0 ? setTimeout(beginExit, remaining) : undefined;
    if (remaining === 0) beginExit();
    return () => { clearTimeout(holdTimer); clearTimeout(fadeTimer); };
  }, [background, enabled, error, identity, pending, targetChatId]);

  return {
    targetChatId,
    // Render-time mismatch protection: never wait for an effect to mask old data.
    blocked: Boolean(error || pending || (presentation && !background && targetChatId)),
    busy: pending && !error,
    error,
    phase: error || pending ? "visible" : presentation?.phase || "visible",
    restorationReady: !error && !pending,
    onTransitionEnd: event => {
      if (event.target !== event.currentTarget || event.propertyName !== "opacity" ||
        pending || error || presentation?.phase !== "exiting") return;
      shown.current = { identity: "", at: 0 };
      setPresentation(null);
    },
  };
}


export function useConversationSurface() { return useContext(ConversationSurfaceContext); }
