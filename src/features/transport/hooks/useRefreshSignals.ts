import { useEffect, useRef } from "react";
import { useOptionalRealtimeTransport } from "./useRealtimeTransport";
import type { PushFrame, RealtimeTransport } from "../contracts/realtimeTransport";

// One subscription per transport and event type, regardless of consumer count.
const subscriptions = new WeakMap<RealtimeTransport, Map<string, { listeners: Set<(frame: PushFrame) => void>; stop: () => void }>>();
export function usePushSignal(type: string, callback: (frame: PushFrame) => void, enabled = true) {
  const transport = useOptionalRealtimeTransport();
  const latest = useRef(callback); latest.current = callback;
  useEffect(() => {
    if (!transport || !enabled) return;
    let map = subscriptions.get(transport);
    if (!map) { map = new Map(); subscriptions.set(transport, map); }
    let entry = map.get(type);
    if (!entry) {
      const listeners = new Set<(frame: PushFrame) => void>();
      entry = { listeners, stop: transport.push.subscribe({ types: [type] }, frame => listeners.forEach(listener => listener(frame))) };
      map.set(type, entry);
    }
    const listener = (frame: PushFrame) => latest.current(frame);
    entry.listeners.add(listener);
    return () => {
      entry!.listeners.delete(listener);
      if (!entry!.listeners.size) { entry!.stop(); map!.delete(type); }
    };
  }, [transport, type, enabled]);
}
const reconnects = new WeakMap<RealtimeTransport, { listeners: Set<() => void>; stop: () => void }>();
export function useReconnectSignal(callback: () => void, enabled = true) {
  const transport = useOptionalRealtimeTransport();
  const latest = useRef(callback); latest.current = callback;
  useEffect(() => {
    if (!transport || !enabled) return;
    let entry = reconnects.get(transport);
    if (!entry) {
      const listeners = new Set<() => void>();
      let connected = transport.getStatus() === "connected";
      let interrupted = false;
      const stop = transport.subscribeStatus(status => {
        if (status === "connected") {
          const recovered = connected && interrupted;
          connected = true; interrupted = false;
          if (recovered) listeners.forEach(listener => listener());
        } else if (connected && status !== "disposed") interrupted = true;
      });
      entry = { listeners, stop }; reconnects.set(transport, entry);
    }
    const listener = () => latest.current(); entry.listeners.add(listener);
    return () => { entry!.listeners.delete(listener); if (!entry!.listeners.size) { entry!.stop(); reconnects.delete(transport); } };
  }, [transport, enabled]);
}
