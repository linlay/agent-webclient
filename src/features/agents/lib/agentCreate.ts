export type AgentProjectType = "coder" | "kbase";

export const ACP_PROXY_OPTIONS = [
  { value: "proxy-acp-claudecode", label: "claude" },
  { value: "proxy-acp-codex", label: "codex" },
];

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
    definition: {
      ...(name ? { name } : {}),
      mode: "CODER",
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
    definition: {
      ...(name ? { name } : {}),
      mode: "KBASE",
      runtimeConfig: { workspaceRoot: workspaceDir },
    },
  };
}
