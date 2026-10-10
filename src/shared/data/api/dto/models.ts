interface ModelMenuOption {
  key: string;
  name?: string;
  icon?: string;
  provider?: string;
  serviceTiers?: string[];
}

export interface AgentEditorModelOption extends ModelMenuOption {
  modelId?: string;
  protocol?: string;
  isVision: boolean;
  contextWindow?: number;
  reasoningEfforts?: string[];
}

// Native menu entries only carry presentation fields and optional service tiers.
// ACP entries retain their discovery metadata.
export interface CoderModelOption extends ModelMenuOption {
  modelId?: string;
  protocol?: string;
  isReasoner?: boolean;
  isVision?: boolean;
  contextWindow?: number;
  timeout?: number;
  reasoningEfforts?: string[];
}

export interface ReasoningEffortOption {
  key: QueryReasoningEffort;
  label: string;
}

export type QueryServiceTier = string;

export interface ServiceTierOption {
  key: QueryServiceTier;
  label: string;
}

export interface CoderModelOptionsResponse {
  models: CoderModelOption[];
  reasoningEfforts: ReasoningEffortOption[];
  serviceTiers?: ServiceTierOption[];
}

export type QueryReasoningEffort =
  | "NONE"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "XHIGH"
  | "MAX";

export interface QueryModelOverride {
  key?: string;
  reasoningEffort?: QueryReasoningEffort;
  serviceTier?: QueryServiceTier;
}
