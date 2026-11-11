import { getClientStorage } from "@/shared/utils/clientStorage";
const GENERAL_AGENT_STORAGE_KEY = "agent-webclient:general-agent-key";

export function readStoredGeneralAgentKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return getClientStorage("local").getItem(GENERAL_AGENT_STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function persistGeneralAgentKey(workerKey: string): void {
  try {
    getClientStorage("local").setItem(GENERAL_AGENT_STORAGE_KEY, workerKey);
  } catch {
    // Agent selection remains usable when storage is unavailable.
  }
}
