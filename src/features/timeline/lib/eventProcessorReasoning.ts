import type { AgentEvent } from "@/app/state/types";
import type {
  EventCommand,
  EventProcessorConfig,
  EventProcessorState,
} from "@/features/timeline/lib/eventProcessorTypes";
import { toText } from "@/shared/utils/eventUtils";
import {
  applyTaskBindingToNode,
  ensureMappedNode,
} from "@/features/timeline/lib/eventProcessorShared";

export function processReasoningEvent(
  event: AgentEvent,
  state: EventProcessorState,
  config: EventProcessorConfig,
): EventCommand[] {
  const commands: EventCommand[] = [];
  const type = toText(event.type);

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
    const delta = typeof event.delta === "string" ? event.delta : "";
    const eventText = typeof event.text === "string" ? event.text : "";
    const reasoningLabel =
      typeof event.reasoningLabel === "string"
        ? event.reasoningLabel
        : existing?.reasoningLabel;
    const text = existing ? `${state.getNodeText(nodeId)}${delta}` : eventText || delta;

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
        expanded: config.reasoningExpandedDefault,
        ts: event.timestamp || existing?.ts || Date.now(),
      },
    });
    return commands;
  }

  if (type === "reasoning.end" || type === "reasoning.snapshot") {
    const reasoningKey = event.reasoningId
      ? String(event.reasoningId)
      : state.activeReasoningKey || `implicit_snap_${state.peekCounter()}`;
    const nodeId = ensureMappedNode({
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
        reasoningLabel: existing?.reasoningLabel,
        text,
        status: "completed",
        expanded: config.reasoningExpandedDefault,
        ts: event.timestamp || existing?.ts || Date.now(),
      },
    });
    commands.push({ cmd: "SET_ACTIVE_REASONING_KEY", key: "" });
    return commands;
  }

  return commands;
}

