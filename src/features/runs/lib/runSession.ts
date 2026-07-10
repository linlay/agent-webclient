import type { AgentEvent } from "@/app/state/types";

export interface RunSession<TSnapshot = unknown> {
	requestId: string;
	chatId: string;
	runId: string;
	agentKey: string;
	teamId: string;
	streaming: boolean;
	abortController: AbortController | null;
	snapshot: TSnapshot | null;
	bufferedEvents: AgentEvent[];
	bufferedDebugLines: string[];
	appliedEventCount: number;
	appliedDebugLineCount: number;
}
