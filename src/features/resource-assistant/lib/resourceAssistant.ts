export type ResourceKind = "automation" | "skill" | "agent" | "connector" | "registry";
export interface ResourceAssistantRequest {
  kind: ResourceKind;
  target?: { id: string; name?: string };
  category?: string;
}
type Translate = (key: string, values?: Record<string, unknown>) => string;

export function resourceComposerPrefill(request: ResourceAssistantRequest, t: Translate) {
  const resource = t(`resourceAssistant.kind.${request.kind}`);
  const category = request.category ? t("resourceAssistant.category", { category: request.category }) : "";
  const target = request.target;
  if (target && !target.id.trim()) throw new Error(t("resourceAssistant.invalidTarget"));
  const draft = target
    ? t("resourceAssistant.draft.update", { resource, name: JSON.stringify(target.name || target.id), id: JSON.stringify(target.id), category })
    : t("resourceAssistant.draft.create", { resource, category });
  if (draft.length > 2048) throw new Error(t("resourceAssistant.draftTooLong"));
  return { composerSkill: request.kind === "automation" ? "platform-automation" : "platform-admin", composerDraft: draft };
}

let lastNewChat = 0;
export function resourceAssistantUrl(agentKey: string, prefill: ReturnType<typeof resourceComposerPrefill>, now = Date.now()): string {
  if (!agentKey.trim()) throw new Error("Missing chat agent");
  const timestamp = Math.max(Math.floor(now), lastNewChat + 1);
  if (!/^[1-9]\d{12}$/.test(String(timestamp))) throw new Error("Invalid new chat timestamp");
  lastNewChat = timestamp;
  const search = new URLSearchParams({ newChat: String(timestamp), ...prefill });
  return `/agent/${encodeURIComponent(agentKey.trim())}?${search}`;
}

/** Standalone has no Desktop default preference: use the first navigable ordinary Agent. */
export function firstChatAgent(data: unknown): string {
  if (!Array.isArray(data)) return "";
  const candidates = data.filter(item => item && typeof item.key === "string" && item.key.trim() && item.kind !== "team" && item.type !== "team");
  const ordinary = candidates.find(item => !item.mode || ["AGENT", "REACT"].includes(String(item.mode).toUpperCase()));
  return String((ordinary || candidates[0])?.key || "").trim();
}
