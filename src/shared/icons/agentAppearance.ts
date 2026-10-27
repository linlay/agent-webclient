export const AGENT_ICON_NAMES = ["general", "coder", "kbase", "team", "executor", "proxy"] as const;
export type AgentIconName = typeof AGENT_ICON_NAMES[number];
export type AgentIconConfig = string | { name?: string; color?: string };
export const AGENT_ICON_COLORS = ["#426C4B", "#4370B4", "#987B40", "#8D64A9", "#B96942", "#358E8A"] as const;
const MODE_ICONS: Record<string, AgentIconName> = { CODER: "coder", KBASE: "kbase", TEAM: "team", EXECUTOR: "executor", PROXY: "proxy" };
export function defaultAgentIconName(mode?: string): AgentIconName {
  return MODE_ICONS[mode?.trim().toUpperCase() || ""] || "general";
}
export function normalizeAgentIconName(value?: string): AgentIconName | undefined {
  const name = value?.trim().toLowerCase() || "";
  return AGENT_ICON_NAMES.includes(name as AgentIconName) ? name as AgentIconName : undefined;
}
export function isExternalAgentIcon(icon: unknown): icon is string {
  return typeof icon === "string" && /\.(svg|png|jpe?g)(?:[?#].*)?$/i.test(icon.trim());
}
export function resolveAgentIcon(icon?: AgentIconConfig, mode?: string): { name: AgentIconName; color?: string } {
  const name = normalizeAgentIconName(typeof icon === "string" ? icon : icon?.name) || defaultAgentIconName(mode);
  const color = typeof icon === "object" && typeof icon?.color === "string" ? icon.color.trim() : "";
  return { name, ...(color ? { color } : {}) };
}
/** Fill presentation gaps while passing through explicit graphics and external images. */
export function effectiveAgentIcon(icon?: AgentIconConfig, mode?: string): AgentIconConfig {
  if (typeof icon === "string" && icon.trim()) return icon;
  if (typeof icon === "object" && icon?.name?.trim()) return icon;
  return resolveAgentIcon(icon, mode);
}
