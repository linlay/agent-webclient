import type { AgentEvent } from "@/shared/contracts/agentEvents";

export type AgentEventSink = (event: AgentEvent) => void;
