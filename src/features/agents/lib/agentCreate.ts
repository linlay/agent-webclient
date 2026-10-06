export type AgentProjectType = "coder" | "kbase";

export function workspaceNameFromPath(path: string): string {
  const normalized = String(path || "").trim();
  return normalized.split(/[\\/]+/).filter(Boolean).pop() || "project";
}

export function buildCoderAgentCreateRequest(
  workspaceDir: string,
  options: { name?: string; acpBridgeId?: string } = {},
) {
  const name = String(options.name || "").trim();
  const runtimeConfig: Record<string, unknown> = { workspaceRoot: workspaceDir };
  if (options.acpBridgeId) runtimeConfig.acpBridgeId = options.acpBridgeId;
  return {
    isProject: true,
    definition: {
      ...(name ? { name } : {}),
      mode: "CODER",
      // Platform never infers the engine from acpBridgeId; it must be explicit.
      ...(options.acpBridgeId ? { engine: "acp" } : {}),
      runtimeConfig,
    },
  };
}

export function buildKbaseAgentCreateRequest(
  workspaceDir: string,
  options: { name?: string } = {},
) {
  const name = String(options.name || "").trim();
  return {
    isProject: true,
    definition: {
      ...(name ? { name } : {}),
      mode: "KBASE",
      runtimeConfig: { workspaceRoot: workspaceDir },
    },
  };
}
