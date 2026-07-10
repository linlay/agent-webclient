import type { AgentEvent } from "@/app/state/types";

export type AgentEventSink = (event: AgentEvent) => void;
