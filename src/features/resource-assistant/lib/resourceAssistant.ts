import { readStoredGeneralAgentKey } from "@/shared/utils/generalAgentPreference";
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
  return { composerDraft: draft };
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

export function readResourceAssistantAgentKey(source: string, desktop: boolean): string {
  if (desktop) return new URL(source).searchParams.get("chatDefaultAgentKey")?.trim() || "";
  const savedKey = readStoredGeneralAgentKey();
  return savedKey.startsWith("agent:") ? savedKey.slice("agent:".length).trim() : "";
}

export function hasConfiguredResourceAssistant(data: unknown, agentKey: string): boolean {
  return Array.isArray(data) && data.some(agent => agent?.key === agentKey);
}
