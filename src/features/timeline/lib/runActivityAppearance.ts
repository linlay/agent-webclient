import { resolveAgentIcon, type AgentIconConfig } from "@/shared/icons/agentAppearance";
import type { RunActivityAppearance } from "@/shared/icons/agentCharacterState";
export * from "@/shared/icons/agentCharacterState";

export function resolveRunActivityAppearance(agent?: { mode?: string; icon?: AgentIconConfig }): RunActivityAppearance {
  const { name, color } = resolveAgentIcon(agent?.icon, agent?.mode);
  const variants = { general: "general", coder: "code", kbase: "knowledge", team: "team", executor: "executor", proxy: "agent" } as const;
  return { variant: variants[name], ...(color ? { color } : {}) };
}
