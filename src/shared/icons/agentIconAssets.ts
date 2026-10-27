import general from "./agent-icons/general.svg";
import coder from "./agent-icons/coder.svg";
import kbase from "./agent-icons/kbase.svg";
import team from "./agent-icons/team.svg";
import executor from "./agent-icons/executor.svg";
import proxy from "./agent-icons/proxy.svg";
import { normalizeAgentIconName } from "./agentAppearance";
export { AGENT_ICON_NAMES } from "./agentAppearance";
const ICONS = { general, coder, kbase, team, executor, proxy };
/** Static fallback for consumers that require a URL rather than an inline SVG. */
export function getAgentIconSource(iconName?: string): string {
  return ICONS[normalizeAgentIconName(iconName) || "general"];
}
