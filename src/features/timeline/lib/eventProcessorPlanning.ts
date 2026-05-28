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

function getPlanningNodeKey(event: AgentEvent, state: EventProcessorState): string {
  const planningId = toText(event.planningId).trim();
  if (planningId) return `planning:${planningId}`;

  const runId = toText(event.runId).trim() || state.runId;
  if (runId) return `planning_run:${runId}`;

  return `planning_implicit:${state.peekCounter()}`;
}

function readPlanningLabel(event: AgentEvent, fallback?: string): string {
  return (
    toText(event.planningLabel).trim() ||
    toText(event.title).trim() ||
    fallback ||
    "Planning"
  );
}

function readRawText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readPlanningText(event: AgentEvent): string {
  return readRawText(event.text);
}

export function processPlanningEvent(
  event: AgentEvent,
  state: EventProcessorState,
  config: EventProcessorConfig,
): EventCommand[] {
  const commands: EventCommand[] = [];
  const type = toText(event.type);

  if (type === "planning.start" || type === "planning.delta") {
    const planningKey = getPlanningNodeKey(event, state);
    const nodeId = ensureMappedNode({
      currentNodeId: state.getReasoningNodeId(planningKey),
      getNode: state.getTimelineNode,
      setMapCommand: {
        cmd: "SET_REASONING_NODE_ID",
        reasoningId: planningKey,
        nodeId: "",
      },
      prefix: "planning",
      commands,
      state,
    });

    const existing = state.getTimelineNode(nodeId);
    const delta = readRawText(event.delta);
    const eventText = readPlanningText(event);
    const text = existing ? `${state.getNodeText(nodeId)}${delta}` : eventText || delta;

    commands.push({
      cmd: "SET_TIMELINE_NODE",
      id: nodeId,
      node: {
        id: nodeId,
        kind: "planning",
        ...applyTaskBindingToNode(event, state, existing),
        reasoningLabel: readPlanningLabel(event, existing?.reasoningLabel),
        text,
        status: "running",
        expanded: config.reasoningExpandedDefault,
        ts: event.timestamp || existing?.ts || Date.now(),
      },
    });
    return commands;
  }

  if (type === "planning.end" || type === "planning.snapshot") {
    const planningKey = getPlanningNodeKey(event, state);
    const nodeId = ensureMappedNode({
      currentNodeId: state.getReasoningNodeId(planningKey),
      getNode: state.getTimelineNode,
      setMapCommand: {
        cmd: "SET_REASONING_NODE_ID",
        reasoningId: planningKey,
        nodeId: "",
      },
      prefix: "planning",
      commands,
      state,
    });

    const existing = state.getTimelineNode(nodeId);
    const text = readPlanningText(event) || state.getNodeText(nodeId);

    commands.push({
      cmd: "SET_TIMELINE_NODE",
      id: nodeId,
      node: {
        id: nodeId,
        kind: "planning",
        ...applyTaskBindingToNode(event, state, existing),
        reasoningLabel: readPlanningLabel(event, existing?.reasoningLabel),
        text,
        status: "completed",
        expanded: config.reasoningExpandedDefault,
        ts: event.timestamp || existing?.ts || Date.now(),
      },
    });
    return commands;
  }

  return commands;
}
