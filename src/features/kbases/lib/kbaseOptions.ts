import { getAgent, getKBaseOptions } from "@/shared/data";
import type { KBaseOption, KBaseOptionsResponse } from "@/shared/data/api/dto/kbases";

function validLibrary(item: KBaseOption): boolean {
  return Boolean(item && typeof item.id === "string" && item.id && typeof item.name === "string" &&
    typeof item.readable === "boolean" && typeof item.indexing === "boolean" && typeof item.degraded === "boolean" &&
    Array.isArray(item.collections) && item.collections.every(collection => collection && typeof collection.name === "string"));
}

export function parseKBaseOptions(value: unknown, agentKey: string): KBaseOptionsResponse {
  const data = value as KBaseOptionsResponse | undefined;
  if (!data || data.agentKey !== agentKey || typeof data.capability?.available !== "boolean" ||
      !Array.isArray(data.libraries) || !data.libraries.every(validLibrary)) {
    throw new Error("kbase.protocolUnavailable");
  }
  return data;
}

export async function loadKBaseOptions(agentKey: string, signal?: AbortSignal): Promise<KBaseOptionsResponse> {
  const agent = (await getAgent(agentKey)).data;
  if (agent.interactionConfig?.mustUseKbases !== true) throw new Error("kbase.disabled");
  return parseKBaseOptions((await getKBaseOptions(agentKey, signal)).data, agentKey);
}

export function unavailableKbaseIds(data: KBaseOptionsResponse | undefined, ids: string[]): string[] {
  if (!data?.capability.available) return [...ids];
  return ids.filter(id => !data.libraries.some(item => item.id === id && item.readable));
}
