import type { AgentEvent, ToolState } from "@/app/state/types";
import type {
  EventCommand,
  EventProcessorState,
} from "@/features/timeline/lib/eventProcessorTypes";
import { parseFrontendToolParams } from "@/features/tools/lib/frontendToolParams";
import { toText } from "@/shared/utils/eventUtils";
import { pickToolName, resolveViewportKey } from "@/features/timeline/lib/toolEvent";
import {
  applyTaskBindingToNode,
  buildToolTimelineNode,
  ensureMappedNode,
  normalizePublishedArtifacts,
  parseToolArgsBuffer,
  pickEventText,
  readToolArgumentsText,
  readToolDescription,
  resolveFinalToolArgsText,
} from "@/features/timeline/lib/eventProcessorShared";

export function processToolEvent(
  event: AgentEvent,
  state: EventProcessorState,
): EventCommand[] {
  const commands: EventCommand[] = [];
  const type = toText(event.type);

  if ((type === "tool.start" || type === "tool.snapshot") && event.toolId) {
    const toolId = event.toolId;
    const existingToolState = state.getToolState(toolId);
    const nodeId = ensureMappedNode({
      currentNodeId: state.getToolNodeId(toolId),
      getNode: state.getTimelineNode,
      setMapCommand: { cmd: "SET_TOOL_NODE_ID", toolId, nodeId: "" },
      prefix: "tool",
      commands,
      state,
    });
    const existing = state.getTimelineNode(nodeId);
    const params = parseFrontendToolParams(event);
    const resolvedParams = params.found && params.params ? params.params : null;
    const rawArgsText = readToolArgumentsText(event);
    const prettyArgsText = resolvedParams ? JSON.stringify(resolvedParams, null, 2) : "";
    const argsText = resolvedParams
      ? prettyArgsText
      : rawArgsText || existing?.argsText || existingToolState?.argsBuffer || "";
    const description = pickEventText(
      readToolDescription(event),
      existing?.description,
      existingToolState?.description,
    );
    const viewportKey =
      resolveViewportKey(event) || existing?.viewportKey || existingToolState?.viewportKey || "";
    const argsBuffer = rawArgsText || prettyArgsText || existingToolState?.argsBuffer || "";

    commands.push({
      cmd: "SET_TIMELINE_NODE",
      id: nodeId,
      node: buildToolTimelineNode({
        nodeId,
        event,
        existing,
        existingToolState,
        argsText,
        status: type === "tool.snapshot" ? "completed" : "running",
        result: existing?.result || null,
        ts: event.timestamp || existing?.ts || Date.now(),
        state,
      }),
    });
    commands.push({
      cmd: "SET_TOOL_STATE",
      toolId,
      state: {
        toolId,
        argsBuffer,
        toolLabel: event.toolLabel || existingToolState?.toolLabel || "",
        toolName: pickToolName(existingToolState?.toolName, event.toolName),
        toolType: event.toolType || existingToolState?.toolType || "",
        viewportKey,
        toolTimeout: event.toolTimeout ?? existingToolState?.toolTimeout ?? null,
        toolParams: resolvedParams || existingToolState?.toolParams || null,
        description,
        runId: event.runId || existingToolState?.runId || state.runId,
      },
    });
    return commands;
  }

  if (type === "tool.args" && event.toolId) {
    const toolId = event.toolId;
    const existingToolState = state.getToolState(toolId);
    const nextArgsBuffer = `${existingToolState?.argsBuffer || ""}${String(
      event.delta || "",
    )}`;
    const parsedToolParams = parseToolArgsBuffer(
      nextArgsBuffer,
      existingToolState?.toolParams || null,
    );
    const viewportKey = resolveViewportKey(event) || existingToolState?.viewportKey || "";
    const description = pickEventText(
      readToolDescription(event),
      existingToolState?.description,
    );
    const nextToolState: ToolState = {
      toolId,
      argsBuffer: nextArgsBuffer,
      toolLabel: event.toolLabel || existingToolState?.toolLabel || "",
      toolName: pickToolName(existingToolState?.toolName, event.toolName),
      toolType: event.toolType || existingToolState?.toolType || "",
      viewportKey,
      toolTimeout: event.toolTimeout ?? existingToolState?.toolTimeout ?? null,
      toolParams: parsedToolParams,
      description,
      runId: event.runId || existingToolState?.runId || state.runId,
    };
    commands.push({ cmd: "SET_TOOL_STATE", toolId, state: nextToolState });

    const nodeId = ensureMappedNode({
      currentNodeId: state.getToolNodeId(toolId),
      getNode: state.getTimelineNode,
      setMapCommand: { cmd: "SET_TOOL_NODE_ID", toolId, nodeId: "" },
      prefix: "tool",
      commands,
      state,
    });
    const existingNode = state.getTimelineNode(nodeId);
    commands.push({
      cmd: "SET_TIMELINE_NODE",
      id: nodeId,
      node: {
        id: nodeId,
        kind: "tool",
        ...applyTaskBindingToNode(event, state, existingNode),
        toolId,
        toolLabel: nextToolState.toolLabel || existingNode?.toolLabel || "",
        toolName: pickToolName(existingNode?.toolName, nextToolState.toolName),
        viewportKey: viewportKey || existingNode?.viewportKey || "",
        description: nextToolState.description || existingNode?.description || "",
        argsText: parsedToolParams
          ? JSON.stringify(parsedToolParams, null, 2)
          : nextArgsBuffer || existingNode?.argsText || "",
        status: "running",
        result: existingNode?.result || null,
        ts: event.timestamp || existingNode?.ts || Date.now(),
      },
    });
    return commands;
  }

  if (type === "tool.result") {
    const toolId = event.toolId || "";
    if (!toolId) return commands;
    let nodeId = state.getToolNodeId(toolId);
    if (!nodeId) {
      nodeId = `tool_${state.nextCounter()}`;
      commands.push({ cmd: "SET_TOOL_NODE_ID", toolId, nodeId });
      commands.push({ cmd: "APPEND_TIMELINE_ORDER", nodeId });
    }
    const existing = state.getTimelineNode(nodeId);
    const existingToolState = state.getToolState(toolId);
    const resultValue = event.result ?? event.output ?? event.text ?? "";
    const resultText =
      typeof resultValue === "string"
        ? resultValue
        : JSON.stringify(resultValue, null, 2);
    const argsText = resolveFinalToolArgsText(
      existing?.argsText || "",
      existingToolState?.argsBuffer || "",
      readToolArgumentsText(event),
    );
    commands.push({
      cmd: "SET_TIMELINE_NODE",
      id: nodeId,
      node: buildToolTimelineNode({
        nodeId,
        event,
        existing,
        existingToolState,
        argsText,
        status: event.error ? "failed" : "completed",
        result: { text: resultText, isCode: typeof resultValue !== "string" },
        ts: existing?.ts || event.timestamp || Date.now(),
        state,
      }),
    });
    return commands;
  }

  if (type === "tool.end") {
    const toolId = event.toolId || "";
    if (!toolId) return commands;
    let nodeId = state.getToolNodeId(toolId);
    if (!nodeId) {
      nodeId = `tool_${state.nextCounter()}`;
      commands.push({ cmd: "SET_TOOL_NODE_ID", toolId, nodeId });
      commands.push({ cmd: "APPEND_TIMELINE_ORDER", nodeId });
    }
    const existing = state.getTimelineNode(nodeId);
    const existingToolState = state.getToolState(toolId);
    const argsText = resolveFinalToolArgsText(
      existing?.argsText || "",
      existingToolState?.argsBuffer || "",
      readToolArgumentsText(event),
    );
    commands.push({
      cmd: "SET_TIMELINE_NODE",
      id: nodeId,
      node: buildToolTimelineNode({
        nodeId,
        event,
        existing,
        existingToolState,
        argsText,
        status: event.error
          ? "failed"
          : existing?.status === "failed"
            ? "failed"
            : "completed",
        result: existing?.result || null,
        ts: existing?.ts || event.timestamp || Date.now(),
        state,
      }),
    });
    return commands;
  }

  if (type.startsWith("action.")) {
    return commands;
  }

  if (type === "artifact.publish") {
    const artifacts = normalizePublishedArtifacts(event);
    if (artifacts.length === 0) {
      return commands;
    }
    for (const artifact of artifacts) {
      commands.push({ cmd: "UPSERT_ARTIFACT", artifact });
    }
    return commands;
  }

  return commands;
}

