import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { useParams } from "react-router-dom";
import { useAppState } from "@/app/state/AppContext";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import type { AgentSkill } from "@/shared/data/api/client";
import { useAgentSkillsQuery } from "@/shared/data/query/queries";

type SkillLabelResolver = (key: string, fallbackLabel?: string) => string;

interface AgentSkillLabelsContextValue {
  resolveSkillLabel: SkillLabelResolver;
}

function normalizeSkillKey(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function buildAgentSkillLabelMap(
  skills: readonly AgentSkill[],
): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  for (const skill of skills) {
    const key = normalizeSkillKey(skill.key);
    const label = String(skill.name || "").trim();
    if (key && label) {
      labels.set(key, label);
    }
  }
  return labels;
}

export function resolveAgentSkillLabel(
  labels: ReadonlyMap<string, string>,
  key: string,
  fallbackLabel = "",
): string {
  const normalizedKey = normalizeSkillKey(key);
  return (
    labels.get(normalizedKey) ||
    String(fallbackLabel || "").trim() ||
    String(key || "").trim()
  );
}

const defaultContextValue: AgentSkillLabelsContextValue = {
  resolveSkillLabel: (_key, fallbackLabel) =>
    String(fallbackLabel || _key || "").trim(),
};

const AgentSkillLabelsContext =
  createContext<AgentSkillLabelsContextValue>(defaultContextValue);

export const AgentSkillLabelsProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const state = useAppState();
  const params = useParams<{ agentKey?: string }>();
  const currentWorker = resolveCurrentWorkerSummary(state);
  const routeAgentKey = String(params.agentKey || "").trim();
  const currentAgentKey =
    currentWorker?.type === "agent"
      ? String(currentWorker.sourceId || "").trim()
      : "";
  const agentKey = routeAgentKey || currentAgentKey;
  const skillQuery = useAgentSkillsQuery(agentKey, {
    enabled: Boolean(agentKey),
  });
  const labels = useMemo(
    () => buildAgentSkillLabelMap(skillQuery.data?.skills || []),
    [skillQuery.data],
  );
  const resolveSkillLabel = useCallback<SkillLabelResolver>(
    (key, fallbackLabel) =>
      resolveAgentSkillLabel(labels, key, fallbackLabel),
    [labels],
  );
  const value = useMemo(
    () => ({ resolveSkillLabel }),
    [resolveSkillLabel],
  );

  return (
    <AgentSkillLabelsContext.Provider value={value}>
      {children}
    </AgentSkillLabelsContext.Provider>
  );
};

export function useAgentSkillLabels(): AgentSkillLabelsContextValue {
  return useContext(AgentSkillLabelsContext);
}
