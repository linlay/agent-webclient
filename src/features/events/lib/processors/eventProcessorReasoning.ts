import { streamEndFailure } from "./streamEndFailure";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type {
  EventCommand,
  EventProcessorConfig,
  EventProcessorState,
} from "@/features/events/lib/eventProcessorTypes";
import { toText } from "@/shared/utils/eventUtils";
import {
  applyTaskBindingToNode,
  ensureMappedNode,
} from "@/features/events/lib/processors/eventProcessorShared";

export function processReasoningEvent(
  event: AgentEvent,
  state: EventProcessorState,
  config: EventProcessorConfig,
): EventCommand[] {
  const commands: EventCommand[] = [];
  const timestamp = event.timestamp ?? 0;
  const type = toText(event.type);
  const priorId = typeof event.reasoningId === "string" ? state.getReasoningNodeId(event.reasoningId) : undefined;
  const prior = priorId ? state.getTimelineNode(priorId) : undefined;
  if (prior?.status === "failed" && prior.errorDetail) return [];


  if (type === "reasoning.start" || type === "reasoning.delta") {
    let reasoningKey = event.reasoningId ? String(event.reasoningId) : "";
    if (!reasoningKey) {
      reasoningKey =
        type === "reasoning.start" || !state.activeReasoningKey
          ? `implicit_reasoning_${state.peekCounter()}`
          : state.activeReasoningKey;
    }
    commands.push({ cmd: "SET_ACTIVE_REASONING_KEY", key: reasoningKey });

    const nodeId = ensureMappedNode({
      reuseTerminal: event.status === "failed",
      currentNodeId: state.getReasoningNodeId(reasoningKey),
      getNode: state.getTimelineNode,
      setMapCommand: {
        cmd: "SET_REASONING_NODE_ID",
        reasoningId: reasoningKey,
        nodeId: "",
      },
      prefix: "thinking",
      commands,
      state,
    });

    const existing = state.getTimelineNode(nodeId);
    if (existing?.status === "failed" || existing?.status === "completed") return [];
    const delta = typeof event.delta === "string" ? event.delta : "";
    const eventText = typeof event.text === "string" ? event.text : "";
    const reasoningLabel =
      typeof event.reasoningLabel === "string"
        ? event.reasoningLabel
        : existing?.reasoningLabel;
    const text = existing
      ? `${state.getNodeText(nodeId)}${delta}`
      : eventText || delta;
    const startedAt =
      type === "reasoning.start"
        ? event.timestamp ?? Date.now()
        : existing?.startedAt;

    commands.push({
      cmd: "SET_TIMELINE_NODE",
      id: nodeId,
      node: {
        id: nodeId,
        kind: "thinking",
        ...applyTaskBindingToNode(event, state, existing),
        reasoningLabel,
        text,
        status: "running",
        expanded: existing?.expanded ?? config.reasoningExpandedDefault,
        ts: timestamp,
        startedAt,
      },
    });
    return commands;
  }

  if (type === "reasoning.end" || type === "reasoning.snapshot") {
    const reasoningKey = event.reasoningId
      ? String(event.reasoningId)
      : state.activeReasoningKey || `implicit_snap_${state.peekCounter()}`;
    const nodeId = ensureMappedNode({
      reuseTerminal: event.status === "failed",
      currentNodeId: state.getReasoningNodeId(reasoningKey),
      getNode: state.getTimelineNode,
      setMapCommand: {
        cmd: "SET_REASONING_NODE_ID",
        reasoningId: reasoningKey,
        nodeId: "",
      },
      prefix: "thinking",
      commands,
      state,
    });
    const existing = state.getTimelineNode(nodeId);
    const text =
      typeof event.text === "string" ? event.text : state.getNodeText(nodeId);
    commands.push({
      cmd: "SET_TIMELINE_NODE",
      id: nodeId,
      node: {
        id: nodeId,
        kind: "thinking",
        ...applyTaskBindingToNode(event, state, existing),
        reasoningLabel: existing?.reasoningLabel ?? (typeof event.reasoningLabel === "string" ? event.reasoningLabel : undefined),
        text,
        status: "completed",
        startedAt: existing?.startedAt,
        endedAt: existing?.endedAt ?? timestamp,
        ...streamEndFailure(event, existing),
        expanded: false,
        ts: timestamp,
      },
    });
    if (state.activeReasoningKey === reasoningKey) commands.push({ cmd: "SET_ACTIVE_REASONING_KEY", key: "" });
    return commands;
  }

  return commands;
}
