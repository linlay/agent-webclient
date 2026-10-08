import type { AgentToolBinding } from "@/shared/data/api/dto/agents";

export interface AgentToolOption {
  binding?: AgentToolBinding;
  key: string;
  label: string;
  sourceCategory: string;
  kind: string;
}

export interface AgentSkillOption {
  id: string;
  label: string;
  description?: string;
  source: "center" | "private";
  overridesCenter?: boolean;
}

// Projection only: display Platform tools without adding them to the form value.
export function withAgentToolBindings(options: AgentToolOption[], bindings?: AgentToolBinding[] | null): AgentToolOption[] {
  const normalizedBindings = bindings ?? [];
  const byName = new Map(normalizedBindings.map(binding => [binding.name, binding]));
  const result = options.map(option => ({ ...option, binding: byName.get(option.key) }));
  for (const binding of normalizedBindings) {
    if (!result.some(option => option.key === binding.name)) result.push({ key: binding.name, label: binding.name, kind: "", sourceCategory: "", binding });
  }
  return result;
}

/** Keep connector-owned tools out of the editor without changing YAML declarations. */
export function projectAgentTools(
  options: AgentToolOption[],
  bindings: AgentToolBinding[] | null | undefined,
  declared: string[],
  connectorToolNames: string[],
): { available: AgentToolOption[]; selected: AgentToolOption[] } {
  const connectorTools = new Set([
    ...connectorToolNames,
    ...options.filter(tool => tool.sourceCategory === "mcp").map(tool => tool.key),
  ]);
  const available = withAgentToolBindings(options, bindings).filter(tool => !connectorTools.has(tool.key));
  const byKey = new Map(available.map(tool => [tool.key, tool]));
  const selected = [...new Set([
    ...available.filter(tool => tool.binding && (!tool.binding.removable || tool.binding.excluded)).map(tool => tool.key),
    ...declared.filter(key => !connectorTools.has(key)),
  ])].map(key => byKey.get(key) || { key, label: key, sourceCategory: "", kind: "" });
  return { available, selected };
}
