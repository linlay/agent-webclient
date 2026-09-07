export interface AgentToolOption {
  key: string;
  label: string;
  sourceCategory: string;
  kind: string;
}

export interface AgentSkillOption {
  key: string;
  label: string;
  description?: string;
  source: "center" | "private";
  overridesCenter?: boolean;
}
