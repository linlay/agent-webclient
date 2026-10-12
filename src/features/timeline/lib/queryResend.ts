import type { TimelineNode } from "./timelineState";
export interface QueryResendSnapshot { references: unknown[] }
export function queryResendSnapshot(node: Pick<TimelineNode, "references">): QueryResendSnapshot {
 return {references: JSON.parse(JSON.stringify(node.references || []))};
}

// Relative @chat files belong to the source Chat, even when resend allocates a new one.
export function referencesForNewChat(references: unknown[], sourceChatId: string): unknown[] {
 return references.map(reference => {
  if (!reference || typeof reference !== "object") return reference;
  const ref = reference as Record<string,unknown>;
  if (["skill","kbase","chat","selection","site"].includes(String(ref.type)) || typeof ref.url !== "string") return ref;
  const raw = ref.url.trim();
  if (!raw || /^[a-z][a-z\d+.-]*:/i.test(raw) || raw.startsWith("/") || raw.startsWith("@workspace")) return ref;
  const relative = raw.startsWith("@chat/") ? raw.slice(6) : raw;
  if (relative.startsWith("@")) return ref;
  const {path: _path, ...rest} = ref;
  return {...rest,url:`/api/resource?file=${encodeURIComponent(`${sourceChatId}/${relative}`)}`};
 });
}
