import type {
  PushFilter,
  PushFrame,
  PushTransport,
} from "@/features/transport/contracts/realtimeTransport";
import { ensureStandaloneWsClient } from "@/features/transport/lib/standaloneWsClient";
import { subscribeWsPush } from "@/features/transport/lib/wsClientSingleton";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readFrameField(frame: PushFrame, key: "type" | "chatId" | "agentKey"): string {
  const nested = Object.keys(record(frame.payload)).length
    ? record(frame.payload)
    : record(frame.data);
  return String(frame[key] ?? nested[key] ?? "").trim();
}

function matches(filter: PushFilter, frame: PushFrame): boolean {
  const types = new Set(filter.types.map((type) => String(type || "").trim()).filter(Boolean));
  if (types.size > 0 && !types.has(readFrameField(frame, "type"))) return false;
  if (filter.chatId && filter.chatId !== readFrameField(frame, "chatId")) return false;
  if (filter.agentKey && filter.agentKey !== readFrameField(frame, "agentKey")) return false;
  return true;
}

export class StandalonePushTransport implements PushTransport {
  subscribe(filter: PushFilter, listener: (frame: PushFrame) => void): () => void {
    let active = true;
    const unsubscribe = subscribeWsPush((frame) => {
      const pushFrame = frame as PushFrame;
      if (active && matches(filter, pushFrame)) listener(pushFrame);
    });
    void ensureStandaloneWsClient()
      .then((client) => (active ? client.connect() : undefined))
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }
}
