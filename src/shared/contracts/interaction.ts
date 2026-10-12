export interface InteractionConfig {
  model: boolean;
  accessLevel: boolean;
  mustUseSkills: boolean;
  mustUseKbases?: boolean;
  connectors: boolean;
  attachment: { localFiles: boolean; chatRecords: boolean };
  // Entry visibility is decided by the Platform; absent means hidden.
  showEditingMode?: boolean;
  showPlanningMode?: boolean;
  showTerminal?: boolean;
}
export type InteractionOverrides = Partial<Omit<InteractionConfig, "attachment">> & {
  attachment?: Partial<InteractionConfig["attachment"]>;
};

// Only the Agent editor form uses these to preview unset overrides. Runtime
// surfaces must read the resolved interactionConfig the Platform returns.
export function interactionDefaults(mode: string): InteractionConfig {
  const normalized = mode.trim().toUpperCase();
  const kbase = normalized === "KBASE";
  return {
    model: !kbase && !["PROXY", "CHANNEL"].includes(normalized),
    accessLevel: !kbase,
    mustUseSkills: true,
    mustUseKbases: !["KBASE", "TEAM", "PROXY", "CHANNEL"].includes(normalized),
    connectors: !kbase,
    attachment: { localFiles: true, chatRecords: !kbase && normalized !== "CODER" },
    showPlanningMode: ["", "GENERAL", "REACT", "CODER", "KBASE", "TEAM"].includes(normalized),
    showEditingMode: kbase,
    showTerminal: normalized === "CODER",
  };
}
// pendingInteraction means "the Platform has not answered yet". It hides every
// entry but is not a decision, so callers must not clear user choices on it.
export function isInteractionPending(config: InteractionConfig): boolean {
  return config === pendingInteraction;
}
export const pendingInteraction: InteractionConfig = {
  model: false, accessLevel: false, mustUseSkills: false, mustUseKbases: false, connectors: false,
  attachment: { localFiles: false, chatRecords: false },
  showEditingMode: false, showPlanningMode: false, showTerminal: false,
};
