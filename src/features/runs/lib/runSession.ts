import type { AgentEvent } from "@/app/state/types";
import type { RunOwner } from "@/shared/data/runOwner";

export interface RunSession<TSnapshot = unknown> {
	requestId: string;
	chatId: string;
	runId: string;
	agentKey: string;
	teamId: string;
	owner?: RunOwner;
	streaming: boolean;
	abortController: AbortController | null;
	snapshot: TSnapshot | null;
	bufferedEvents: AgentEvent[];
	bufferedDebugLines: string[];
	appliedEventCount: number;
	appliedDebugLineCount: number;
}
