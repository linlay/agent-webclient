export interface InteractionConfig {
  model: boolean;
  accessLevel: boolean;
  mustUseSkills: boolean;
  connectors: boolean;
  attachment: { localFiles: boolean; chatRecords: boolean };
}
export type InteractionOverrides = Partial<Omit<InteractionConfig, "attachment">> & {
  attachment?: Partial<InteractionConfig["attachment"]>;
};

// Editor defaults mirror the Platform contract; runtime consumes resolved detail.
export function interactionDefaults(mode: string): InteractionConfig {
  const kbase = mode.toUpperCase() === "KBASE";
  return {
    model: !kbase && !["TEAM", "PROXY", "CHANNEL"].includes(mode.toUpperCase()),
    accessLevel: !kbase,
    mustUseSkills: mode.toUpperCase() !== "TEAM",
    connectors: !kbase && mode.toUpperCase() !== "TEAM",
    attachment: { localFiles: true, chatRecords: !kbase && mode.toUpperCase() !== "CODER" },
  };
}
export const pendingInteraction: InteractionConfig = {
  model: false, accessLevel: false, mustUseSkills: false, connectors: false,
  attachment: { localFiles: false, chatRecords: false },
};
