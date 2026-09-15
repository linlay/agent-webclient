import { useMemo } from "react";
import { getAgent, useDataQuery } from "@/shared/data";
import { dataEndpoints } from "@/shared/data/api/endpoints";

function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean)
    : [];
}

function pick(items: string[]): string {
  return items[Math.floor(Math.random() * items.length)] || "";
}

export function useAgentWelcome(agentKey: string, enabled: boolean) {
  const active = Boolean(agentKey && enabled);
  const query = useDataQuery(dataEndpoints.agent, agentKey, getAgent, { enabled: active });
  const greetings = JSON.stringify(textList(query.data?.greetings));
  const introductions = JSON.stringify(textList(query.data?.introductions));
  const greeting = useMemo(() => active ? pick(JSON.parse(greetings)) : "", [active, agentKey, greetings]);
  const introduction = useMemo(() => active ? pick(JSON.parse(introductions)) : "", [active, agentKey, introductions]);
  return { greeting, introduction, detail: active ? query.data : null };
}
