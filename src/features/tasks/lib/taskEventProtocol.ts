import type { AgentEvent } from "@/app/state/types";
import { toText } from "@/shared/utils/eventUtils";

export function readTaskGroupId(event: AgentEvent): string {
	const raw = event as Record<string, unknown>;
	return toText(raw.groupId) || toText(raw.taskGroupId);
}

export function readSubAgentKey(event: AgentEvent): string {
	return toText((event as Record<string, unknown>).subAgentKey).trim();
}
