import type { AgentEvent } from "@/app/state/types";
import type {
  EventCommand,
  EventProcessorConfig,
  EventProcessorState,
} from "@/features/timeline/lib/eventProcessorTypes";
import { parseContentSegments } from "@/features/timeline/lib/contentSegments";
import {
  awaitingAnswerTitle,
  readAwaitingAnswerText,
} from "@/features/timeline/lib/eventProcessorAwaiting";
import { toText } from "@/shared/utils/eventUtils";
import {
  applyTaskBindingToNode,
  ensureMappedNode,
} from "@/features/timeline/lib/eventProcessorShared";
import { t } from "@/shared/i18n";

export function processContentEvent(
  event: AgentEvent,
  state: EventProcessorState,
  config: EventProcessorConfig,
): EventCommand[] {
  const commands: EventCommand[] = [];
  const type = toText(event.type);

  if (type === "content.start" && event.contentId) {
    const contentId = String(event.contentId);
    const nodeId = ensureMappedNode({
      currentNodeId: state.getContentNodeId(contentId),
      getNode: state.getTimelineNode,
      setMapCommand: { cmd: "SET_CONTENT_NODE_ID", contentId, nodeId: "" },
      prefix: "content",
      commands,
      state,
    });
    const text = typeof event.text === "string" ? event.text : "";
    const existing = state.getTimelineNode(nodeId);
    commands.push({
      cmd: "SET_TIMELINE_NODE",
      id: nodeId,
      node: {
        id: nodeId,
        kind: "content",
        ...applyTaskBindingToNode(event, state, existing),
        contentId,
        text,
        segments: text ? parseContentSegments(contentId, text) : [],
        ts: event.timestamp || Date.now(),
      },
    });
    return commands;
  }

  if (type === "content.delta" && event.contentId) {
    const contentId = String(event.contentId);
    const nodeId = ensureMappedNode({
      currentNodeId: state.getContentNodeId(contentId),
      getNode: state.getTimelineNode,
      setMapCommand: { cmd: "SET_CONTENT_NODE_ID", contentId, nodeId: "" },
      prefix: "content",
      commands,
      state,
    });
    const existing = state.getTimelineNode(nodeId);
    const newText = `${state.getNodeText(nodeId)}${
      typeof event.delta === "string" ? event.delta : ""
    }`;
    commands.push({
      cmd: "SET_TIMELINE_NODE",
      id: nodeId,
      node: {
        id: nodeId,
        kind: "content",
        ...applyTaskBindingToNode(event, state, existing),
        contentId,
        text: newText,
        segments: parseContentSegments(contentId, newText),
        ts: event.timestamp || existing?.ts || Date.now(),
      },
    });
    return commands;
  }

  if (type === "content.end" && event.contentId) {
    const contentId = String(event.contentId);
    const nodeId = ensureMappedNode({
      currentNodeId: state.getContentNodeId(contentId),
      getNode: state.getTimelineNode,
      setMapCommand: { cmd: "SET_CONTENT_NODE_ID", contentId, nodeId: "" },
      prefix: "content",
      commands,
      state,
    });
    const existing = state.getTimelineNode(nodeId);
    const finalText =
      typeof event.text === "string" && event.text.trim()
        ? event.text
        : state.getNodeText(nodeId);
    commands.push({
      cmd: "SET_TIMELINE_NODE",
      id: nodeId,
      node: {
        id: nodeId,
        kind: "content",
        ...applyTaskBindingToNode(event, state, existing),
        contentId,
        text: finalText,
        segments: parseContentSegments(contentId, finalText),
        status: "completed",
        ts: event.timestamp || existing?.ts || Date.now(),
      },
    });
    return commands;
  }

  if (type === "content.snapshot" && event.contentId) {
    const contentId = String(event.contentId);
    const nodeId = ensureMappedNode({
      currentNodeId: state.getContentNodeId(contentId),
      getNode: state.getTimelineNode,
      setMapCommand: { cmd: "SET_CONTENT_NODE_ID", contentId, nodeId: "" },
      prefix: "content",
      commands,
      state,
    });
    const text = typeof event.text === "string" ? event.text : "";
    const existing = state.getTimelineNode(nodeId);
    commands.push({
      cmd: "SET_TIMELINE_NODE",
      id: nodeId,
      node: {
        id: nodeId,
        kind: "content",
        ...applyTaskBindingToNode(event, state, existing),
        contentId,
        text,
        segments: parseContentSegments(contentId, text),
        status: "completed",
        ts: event.timestamp || Date.now(),
      },
    });
    return commands;
  }

  if (type === "awaiting.answer") {
    const runId = toText(event.runId);
    const awaitingId = toText(event.awaitingId);
    const nodeId = awaitingId
      ? `awaiting_answer_${runId || "run"}_${awaitingId}`
      : `awaiting_answer_${state.nextCounter()}`;
    const existing = state.getTimelineNode(nodeId);
    if (!existing) {
      commands.push({ cmd: "APPEND_TIMELINE_ORDER", nodeId });
    }
    commands.push({
      cmd: "SET_TIMELINE_NODE",
      id: nodeId,
      node: {
        id: nodeId,
        kind: "awaiting-answer",
        ...applyTaskBindingToNode(event, state, existing),
        awaitingId,
        title: awaitingAnswerTitle(event),
        text: readAwaitingAnswerText(event) || t("timeline.awaitingAnswer.noAnswer"),
        status: "completed",
        expanded: existing?.expanded ?? false,
        ts: event.timestamp || existing?.ts || Date.now(),
      },
    });
    return commands;
  }

  return commands;
}
