import { useEffect, useRef, useState } from "react";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import { readViewReference } from "@/shared/contracts/view";
import { resolveViewPreview, validViewPreviewAddress, viewPreviewKey, VIEW_PREVIEW_MAX_BYTES,
  type ViewPreviewAddress, type ViewPreviewContent } from "../lib/viewPreview";

const transferId = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16)).join("-");
const CHANNEL = "agent-webclient:view-preview:v1";
function openChannel(): BroadcastChannel | null {
  try { return typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL) : null; } catch { return null; }
}

/** Same-origin data updates only. This channel carries neither HTML nor execution authority. */
export function useViewPreviewPublisher(chatId: string, nodes: ReadonlyMap<string, TimelineNode>) {
  const latest = useRef({ chatId, nodes });
  latest.current = { chatId, nodes };
  const publish = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!chatId) return;
    const channel = openChannel();
    if (!channel) return;
    const requests = new Map<string, ViewPreviewAddress>();
    let sequence = 0;
    const publisher = transferId();
    const send = (id: string, address: ViewPreviewAddress) => {
      if (address.chatId !== latest.current.chatId) return;
      const content = resolveViewPreview(latest.current.nodes, address);
      if (!content || JSON.stringify(content).length > VIEW_PREVIEW_MAX_BYTES) return;
      channel.postMessage({ type: "snapshot", id, key: viewPreviewKey(address), publisher, sequence: ++sequence, content });
    };
    channel.onmessage = event => {
      const message = event.data;
      if (!message || typeof message.id !== "string" || message.id.length > 128) return;
      if (message.type === "release") { requests.delete(message.id); return; }
      if (message.type !== "request" || !validViewPreviewAddress(message.address) || message.address.chatId !== latest.current.chatId) return;
      if (!requests.has(message.id) && requests.size >= 32) return;
      requests.set(message.id, message.address);
      send(message.id, message.address);
    };
    channel.postMessage({ type: "publisher-ready", chatId });
    publish.current = () => requests.forEach((address, id) => send(id, address));
    return () => { publish.current = null; requests.clear(); channel.close(); };
  }, [chatId]);
  useEffect(() => { publish.current?.(); }, [chatId, nodes]);
}

export function useViewPreviewTransfer(address: ViewPreviewAddress): ViewPreviewContent | null {
  const key = viewPreviewKey(address);
  const [snapshot, setSnapshot] = useState<{ key: string; content: ViewPreviewContent } | null>(null);
  useEffect(() => {
    if (!validViewPreviewAddress(address)) return;
    const channel = openChannel();
    if (!channel) return;
    const id = transferId();
    let active = true;
    const sequences = new Map<string, number>();
    channel.onmessage = event => {
      const message = event.data;
      if (active && message?.type === "publisher-ready" && message.chatId === address.chatId) {
        channel.postMessage({ type: "request", id, address });
        return;
      }
      if (!active || message?.type !== "snapshot" || message.id !== id || message.key !== key ||
          typeof message.publisher !== "string" || message.publisher.length > 128 ||
          !Number.isSafeInteger(message.sequence) || message.sequence <= (sequences.get(message.publisher) || 0)) return;
      const content = message.content;
      if (!content || typeof content.payloadRaw !== "string" || content.payloadRaw.length > VIEW_PREVIEW_MAX_BYTES ||
          (content.rawData !== undefined && typeof content.rawData !== "string") ||
          (content.viewError !== undefined && typeof content.viewError !== "string")) return;
      const view = readViewReference(content.view);
      if (!view && !content.viewError) return;
      if (sequences.size >= 8 && !sequences.has(message.publisher)) sequences.delete(sequences.keys().next().value!);
      sequences.set(message.publisher, message.sequence);
      setSnapshot({ key, content: { view, viewError: content.viewError, payloadRaw: content.payloadRaw, rawData: content.rawData } });
    };
    channel.postMessage({ type: "request", id, address });
    return () => { active = false; channel.postMessage({ type: "release", id }); channel.close(); };
  }, [key]);
  return snapshot?.key === key ? snapshot.content : null;
}
