import { useMemo } from "react";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import { useDataQuery } from "@/shared/data/query/serverState";
import {
  getAgents,
  getAgentSkills,
  getChats,
  getMemoryRecords,
  getModelOptions,
  getTeams,
} from "@/shared/data/api/routedClient";
import type {
  GetAgentsOptions,
  GetChatsOptions,
  GetMemoryRecordsParams,
} from "@/shared/data/api/client";
import type { MemoryRecordsPayload } from "@/shared/data/memory/memoryTypes";

export function useAgentsQuery(options: GetAgentsOptions = {}) {
  const input = useMemo(
    () => ({
      includeChats: options.includeChats,
      scope: options.scope,
    }),
    [options.includeChats, options.scope],
  );
  return useDataQuery(dataEndpoints.agents, input, getAgents);
}

export function useTeamsQuery() {
  return useDataQuery(dataEndpoints.teams, undefined, getTeams);
}

export function useAgentSkillsQuery(
  agentKey: string,
  options: { enabled?: boolean } = {},
) {
  const normalizedAgentKey = String(agentKey || "").trim();
  return useDataQuery(
    dataEndpoints.agentSkills,
    normalizedAgentKey,
    getAgentSkills,
    { enabled: options.enabled !== false && Boolean(normalizedAgentKey) },
  );
}

export function useChatsQuery(options: GetChatsOptions = {}) {
  const input = useMemo(
    () => ({
      agentKey: options.agentKey,
    }),
    [options.agentKey],
  );
  return useDataQuery(dataEndpoints.chats, input, getChats);
}

export function useModelOptionsQuery(agentKey?: string) {
  return useDataQuery(
    dataEndpoints.modelOptions,
    String(agentKey || "").trim() || undefined,
    getModelOptions,
  );
}

export function useMemoryRecordsQuery(params: GetMemoryRecordsParams) {
  const input = useMemo<GetMemoryRecordsParams>(
    () => ({
      agentKey: params.agentKey,
      keyword: params.keyword,
      kind: params.kind,
      scopeType: params.scopeType,
      status: params.status,
      category: params.category,
      cursor: params.cursor,
      limit: params.limit,
    }),
    [
      params.agentKey,
      params.category,
      params.cursor,
      params.kind,
      params.keyword,
      params.limit,
      params.scopeType,
      params.status,
    ],
  );
  return useDataQuery<GetMemoryRecordsParams, MemoryRecordsPayload>(
    dataEndpoints.memoryRecords,
    input,
    getMemoryRecords,
  );
}
