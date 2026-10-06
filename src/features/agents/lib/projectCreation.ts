import { selectedCreationDefinition } from "@/shared/creation/creation-profile";
import type {
  AgentCreationGroupOption,
  AgentCreationOptionsResponse,
  AgentCreationTypeKey,
  AgentCreationTypeOption,
  CreateAgentRequest,
} from "@/shared/data";

/**
 * Selection rules of the New Project dialog. They mirror the Desktop rules
 * (zenmind-desktop/src/shared/project-creation.ts) so both clients behave the
 * same on the options that Agent Platform returns.
 */

export type ProjectCreationSelection = {
  typeKey: AgentCreationTypeKey;
  groups: string[];
  /** True once the user changed the groups by hand. */
  groupsTouched: boolean;
  /** Model picked by hand; empty means "use the type's default". */
  modelKey: string;
  acpBridgeId: string;
};

export type ProjectCreationProblem =
  | "typeUnavailable"
  | "directoryRequired"
  | "modelRequired"
  | "acpBridgeRequired";

export function findProjectCreationType(
  options: AgentCreationOptionsResponse,
  typeKey: string,
): AgentCreationTypeOption | undefined {
  return options.types.find((item) => item.key === typeKey);
}

export function selectableProjectCreationGroups(
  options: AgentCreationOptionsResponse,
  typeKey: string,
): AgentCreationGroupOption[] {
  const type = findProjectCreationType(options, typeKey);
  if (!type?.supportsGroups) return [];
  return options.groups.filter((group) => group.available);
}

function defaultGroups(options: AgentCreationOptionsResponse, typeKey: string): string[] {
  const type = findProjectCreationType(options, typeKey);
  if (!type?.supportsGroups) return [];
  const selectable = new Set(
    selectableProjectCreationGroups(options, typeKey).map((group) => group.key),
  );
  return type.defaultGroups.filter((key) => selectable.has(key));
}

export function initialProjectCreationSelection(
  options: AgentCreationOptionsResponse,
): ProjectCreationSelection {
  const type = options.types.find((item) => item.available) ?? options.types[0];
  const typeKey = (type?.key ?? "general") as AgentCreationTypeKey;
  return {
    typeKey,
    groups: defaultGroups(options, typeKey),
    groupsTouched: false,
    modelKey: "",
    acpBridgeId: type?.acpBridges?.[0]?.id ?? "",
  };
}

/**
 * Switching type applies the new type's default groups until the user has
 * edited the groups; after that the user's choice is kept, minus anything the
 * new type cannot use.
 */
export function changeProjectCreationType(
  options: AgentCreationOptionsResponse,
  selection: ProjectCreationSelection,
  typeKey: AgentCreationTypeKey,
): ProjectCreationSelection {
  const type = findProjectCreationType(options, typeKey);
  const selectable = new Set(
    selectableProjectCreationGroups(options, typeKey).map((group) => group.key),
  );
  const groups = selection.groupsTouched
    ? selection.groups.filter((key) => selectable.has(key))
    : defaultGroups(options, typeKey);
  const bridges = type?.acpBridges ?? [];
  return {
    ...selection,
    typeKey,
    groups,
    acpBridgeId: bridges.some((bridge) => bridge.id === selection.acpBridgeId)
      ? selection.acpBridgeId
      : bridges[0]?.id ?? "",
  };
}

export function setProjectCreationGroups(
  options: AgentCreationOptionsResponse,
  selection: ProjectCreationSelection,
  groupKeys: string[],
): ProjectCreationSelection {
  const selectable = new Set(
    selectableProjectCreationGroups(options, selection.typeKey).map((group) => group.key),
  );
  // Keep the configured display order regardless of click order.
  const groups = options.groups
    .map((group) => group.key)
    .filter((key) => selectable.has(key) && groupKeys.includes(key));
  return { ...selection, groups, groupsTouched: true };
}

/**
 * The model that will be used: the hand-picked one, else the type default when
 * Agent Platform reports it as available. An unavailable default is never
 * replaced by an arbitrary model; the user must choose.
 */
export function resolveProjectCreationModel(
  options: AgentCreationOptionsResponse,
  selection: ProjectCreationSelection,
): string {
  const type = findProjectCreationType(options, selection.typeKey);
  if (!type?.modelRequired) return "";
  if (selection.modelKey && options.models.some((model) => model.key === selection.modelKey)) {
    return selection.modelKey;
  }
  return type.defaultModelAvailable && type.defaultModelKey ? type.defaultModelKey : "";
}

export function projectCreationProblem(
  options: AgentCreationOptionsResponse,
  selection: ProjectCreationSelection,
  workspaceDir: string,
): ProjectCreationProblem | null {
  const type = findProjectCreationType(options, selection.typeKey);
  if (!type || !type.available) return "typeUnavailable";
  if (!workspaceDir.trim()) return "directoryRequired";
  if (type.key === "acp" && !selection.acpBridgeId) return "acpBridgeRequired";
  if (type.modelRequired && !resolveProjectCreationModel(options, selection)) {
    return "modelRequired";
  }
  return null;
}

export function buildProjectCreateRequest(
  options: AgentCreationOptionsResponse,
  selection: ProjectCreationSelection,
  workspaceDir: string,
  name = "",
): CreateAgentRequest {
  const type = findProjectCreationType(options, selection.typeKey);
  const runtimeConfig: Record<string, unknown> = { workspaceRoot: workspaceDir.trim() };
  const definition: Record<string, unknown> = {};
  const trimmedName = name.trim();
  if (trimmedName) definition.name = trimmedName;
  if (selection.typeKey === "acp") {
    // Agent Platform never infers the engine from acpBridgeId. The external
    // engine manages its own capabilities and takes no model or groups.
    definition.mode = "CODER";
    definition.engine = "acp";
    runtimeConfig.acpBridgeId = selection.acpBridgeId;
    definition.runtimeConfig = runtimeConfig;
    return { definition };
  }
  Object.assign(definition, selectedCreationDefinition(options, selection.typeKey, selection.groups));
  definition.mode = type?.mode ?? selection.typeKey.toUpperCase();
  definition.runtimeConfig = runtimeConfig;
  // Only a model that differs from the type default is sent; otherwise Agent
  // Platform applies its own configured default.
  const modelKey = resolveProjectCreationModel(options, selection);
  if (modelKey && modelKey !== type?.defaultModelKey) {
    definition.modelConfig = { modelKey };
  }
  return {
    definition,

  };
}
