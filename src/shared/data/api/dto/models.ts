export interface AgentEditorModelOption {
  key: string;
  name?: string;
  icon?: string;
  provider?: string;
  modelId?: string;
  protocol?: string;
  isVision: boolean;
  contextWindow?: number;
  reasoningEfforts?: string[];
  serviceTiers?: string[];
}

export interface CoderModelOption extends AgentEditorModelOption {
  isReasoner: boolean;
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
  defaultModelKey?: string;
  defaultReasoningEffort: QueryReasoningEffort;
  defaultServiceTier?: QueryServiceTier;
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
