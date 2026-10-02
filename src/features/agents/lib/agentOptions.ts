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
export function withAgentToolBindings(options: AgentToolOption[], bindings: AgentToolBinding[] = []): AgentToolOption[] {
  const byName = new Map(bindings.map(binding => [binding.name, binding]));
  const result = options.map(option => ({ ...option, binding: byName.get(option.key) }));
  for (const binding of bindings) {
    if (!result.some(option => option.key === binding.name)) result.push({ key: binding.name, label: binding.name, kind: "", sourceCategory: "", binding });
  }
  return result;
}
