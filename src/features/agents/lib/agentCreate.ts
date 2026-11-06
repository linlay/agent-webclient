export type AgentProjectType = "coder" | "kbase";

export function workspaceNameFromPath(path: string): string {
  const normalized = String(path || "").trim();
  return normalized.split(/[\\/]+/).filter(Boolean).pop() || "project";
}

export function buildCoderAgentCreateRequest(
  workspaceDir: string,
  options: { name?: string } = {},
) {
  const name = String(options.name || "").trim();
  const runtimeConfig: Record<string, unknown> = { workspaceRoot: workspaceDir };
  return {
    isProject: true,
    definition: {
      ...(name ? { name } : {}),
      mode: "CODER",
      icon: { name: "coder" },
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
    createLibrary: { name: name || workspaceNameFromPath(workspaceDir), sourcePath: workspaceDir },
    definition: {
      ...(name ? { name } : {}),
      mode: "KBASE",
      icon: { name: "kbase" },
      runtimeConfig: { workspaceRoot: workspaceDir },
    },
  };
}
