import type {
  AgentEvent,
  FileChangeSummary,
  ToolState,
} from "@/app/state/types";
import type {
  EventCommand,
  EventProcessorState,
} from "@/features/events/lib/eventProcessorTypes";
import { parseFrontendToolParams } from "@/features/tools/lib/frontendToolParams";
import { toText } from "@/shared/utils/eventUtils";
import {
  pickToolName,
  resolveViewportKey,
} from "@/features/events/lib/toolEvent";
import {
  applyTaskBindingToNode,
  buildToolTimelineNode,
  ensureMappedNode,
  isEmptyRecord,
  normalizePublishedArtifacts,
  parseToolArgsBuffer,
  pickEventText,
  readToolArgumentsText,
  readToolDescription,
  resolveFinalToolArgsText,
} from "@/features/events/lib/processors/eventProcessorShared";
import { appendToolOutputChunk } from "@/features/events/lib/toolOutputState";

function readStructuredExitCode(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const rawExitCode = record.exitCode ?? record.exit_code;
  if (typeof rawExitCode === "number" && Number.isFinite(rawExitCode)) {
    return rawExitCode;
  }
  if (typeof rawExitCode === "string" && rawExitCode.trim()) {
    const parsed = Number(rawExitCode);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseResultJSON(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseResultObject(value: unknown): Record<string, unknown> | null {
  if (isObjectRecord(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const parsed = parseResultJSON(value);
  return isObjectRecord(parsed) ? parsed : null;
}

function readLineStat(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
}

function isFileMutationToolName(toolName: string): boolean {
  const normalized = toolName.trim().toLowerCase();
  return normalized === "file_write" || normalized === "file_edit";
}

function normalizeFileChangeSummary(input: {
  toolName: string;
  resultValue: unknown;
  timestamp: number;
  runId: string;
}): FileChangeSummary | null {
  if (!isFileMutationToolName(input.toolName)) {
    return null;
  }

  if (!Number.isFinite(input.timestamp) || input.timestamp <= 0) {
    return null;
  }

  const runId = input.runId.trim();
  if (!runId) {
    return null;
  }

  const record = parseResultObject(input.resultValue);
  if (!record) {
    return null;
  }

  const filePath = toText(record.filePath);
  const lineStats = record.lineStats;
  if (!filePath || !isObjectRecord(lineStats)) {
    return null;
  }

  return {
    runId,
    filePath,
    addedLines: readLineStat(lineStats.addedLines),
    deletedLines: readLineStat(lineStats.deletedLines),
    editedLines: readLineStat(lineStats.editedLines),
    operationCount: 1,
    lastUpdatedAt: input.timestamp,
  };
}

function isToolResultFailure(event: AgentEvent, resultValue: unknown): boolean {
  if (event.error) {
    return true;
  }
  const candidate =
    typeof resultValue === "string"
      ? parseResultJSON(resultValue)
      : resultValue;
  const exitCode = readStructuredExitCode(candidate);
  return exitCode !== null && exitCode !== 0;
}

export function processToolEvent(
  event: AgentEvent,
  state: EventProcessorState,
): EventCommand[] {
  const commands: EventCommand[] = [];
  const timestamp = event.timestamp ?? 0;
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
    const prettyArgsText = resolvedParams
      ? JSON.stringify(resolvedParams, null, 2)
      : "";
    const argsText = resolvedParams && !isEmptyRecord(resolvedParams)
      ? prettyArgsText
      : rawArgsText ||
        existing?.argsText ||
        existingToolState?.argsBuffer ||
        "";
    const description = pickEventText(
      readToolDescription(event),
      existing?.description,
      existingToolState?.description,
    );
    const viewportKey =
      resolveViewportKey(event) ||
      existing?.viewportKey ||
      existingToolState?.viewportKey ||
      "";
    const argsBuffer =
      rawArgsText || prettyArgsText || existingToolState?.argsBuffer || "";

    commands.push({
      cmd: "SET_TIMELINE_NODE",
      id: nodeId,
      node: buildToolTimelineNode({
        nodeId,
        event,
        existing,
        existingToolState,
        argsText,
        status: "running",
        result: existing?.result || null,
        ts: timestamp,
        startedAt: existing?.startedAt ?? timestamp,
        endedAt: existing?.endedAt,
        durationMs: existing?.durationMs,
        state,
      }),
    });
    commands.push({
      cmd: "SET_TOOL_STATE",
      toolId,
      state: {
        toolId,
        argsBuffer,
        agentKey:
          toText(event.agentKey) ||
          existingToolState?.agentKey ||
          state.agentKey ||
          "",
        toolLabel: event.toolLabel || existingToolState?.toolLabel || "",
        toolName: pickToolName(existingToolState?.toolName, event.toolName),
        toolType: event.toolType || existingToolState?.toolType || "",
        viewportKey,
        toolTimeout:
          event.toolTimeout ?? existingToolState?.toolTimeout ?? null,
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
    const viewportKey =
      resolveViewportKey(event) || existingToolState?.viewportKey || "";
    const description = pickEventText(
      readToolDescription(event),
      existingToolState?.description,
    );
    const nextToolState: ToolState = {
      toolId,
      argsBuffer: nextArgsBuffer,
      agentKey:
        toText(event.agentKey) ||
        existingToolState?.agentKey ||
        state.agentKey ||
        "",
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
        description:
          nextToolState.description || existingNode?.description || "",
        argsText: parsedToolParams && !isEmptyRecord(parsedToolParams)
          ? JSON.stringify(parsedToolParams, null, 2)
          : nextArgsBuffer || existingNode?.argsText || "",
        status: "running",
        result: existingNode?.result || null,
        toolOutput: existingNode?.toolOutput,
        ts: existingNode?.ts ?? timestamp,
        startedAt: existingNode?.startedAt ?? timestamp,
        endedAt: existingNode?.endedAt,
      },
    });
    return commands;
  }

  if (type === "tool.output" && event.toolId) {
    const toolId = event.toolId;
    const stream = event.stream;
    const delta = typeof event.delta === "string" ? event.delta : "";
    const chunkIndex = event.chunkIndex;
    if (
      (stream !== "stdout" && stream !== "stderr") ||
      !delta ||
      !Number.isInteger(chunkIndex) ||
      Number(chunkIndex) < 0
    ) {
      return commands;
    }
    const mappedNodeId = state.getToolNodeId(toolId);
    const mappedNode = mappedNodeId
      ? state.getTimelineNode(mappedNodeId)
      : undefined;
    if (
      mappedNode &&
      (["success", "failed", "error", "canceled"] as string[]).includes(
        mappedNode.status || "",
      )
    ) {
      return commands;
    }
    if (Number(chunkIndex) <= (mappedNode?.toolOutput?.lastChunkIndex ?? -1)) {
      return commands;
    }
    const nodeId = ensureMappedNode({
      currentNodeId: mappedNodeId,
      getNode: state.getTimelineNode,
      setMapCommand: { cmd: "SET_TOOL_NODE_ID", toolId, nodeId: "" },
      prefix: "tool",
      commands,
      state,
    });
    const existing = state.getTimelineNode(nodeId);
    const existingToolState = state.getToolState(toolId);
    commands.push({
      cmd: "SET_TIMELINE_NODE",
      id: nodeId,
      node: {
        id: nodeId,
        kind: "tool",
        ...applyTaskBindingToNode(event, state, existing),
        toolId,
        toolLabel:
          toText(event.toolLabel) ||
          existing?.toolLabel ||
          existingToolState?.toolLabel ||
          "",
        toolName: pickToolName(
          existing?.toolName,
          existingToolState?.toolName,
          event.toolName,
        ),
        viewportKey:
          existing?.viewportKey || existingToolState?.viewportKey || "",
        description:
          existing?.description || existingToolState?.description || "",
        argsText: existing?.argsText || existingToolState?.argsBuffer || "",
        status: "running",
        result: null,
        toolOutput: appendToolOutputChunk(existing?.toolOutput, {
          stream,
          delta,
          chunkIndex: Number(chunkIndex),
        }),
        ts: existing?.ts ?? timestamp,
        startedAt: existing?.startedAt ?? timestamp,
        endedAt: undefined,
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
    const resolvedToolName = pickToolName(
      existingToolState?.toolName,
      event.toolName,
    );
    const failed = isToolResultFailure(event, resultValue);
    const resultRunId =
      toText(event.runId) || existingToolState?.runId || state.runId;
    const fileChange = failed
      ? null
      : normalizeFileChangeSummary({
          toolName: resolvedToolName,
          resultValue,
          timestamp,
          runId: resultRunId,
        });
    const resultText =
      typeof resultValue === "string"
        ? resultValue
        : JSON.stringify(resultValue, null, 2);
    const endedAt = timestamp;
    const startedAt =
      typeof existing?.startedAt === "number"
        ? existing.startedAt
        : typeof existing?.ts === "number"
          ? existing.ts
          : undefined;
    const durationMs =
      typeof startedAt === "number"
        ? Math.max(0, endedAt - startedAt)
        : undefined;
    const argsText = resolveFinalToolArgsText(
      existing?.argsText || "",
      existingToolState?.argsBuffer || "",
      readToolArgumentsText(event),
    );
    commands.push({
      cmd: "SET_TIMELINE_NODE",
      id: nodeId,
      node: {
        ...buildToolTimelineNode({
          nodeId,
          event,
          existing,
          existingToolState,
          argsText,
          status: failed ? "failed" : "success",
          result: { text: resultText, isCode: typeof resultValue !== "string" },
          ts: existing?.ts ?? timestamp,
          startedAt,
          endedAt,
          durationMs,
          state,
        }),
        toolOutput: undefined,
      },
    });
    if (fileChange) {
      commands.push({ cmd: "UPSERT_FILE_CHANGE", fileChange });
    }
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
        status: "running",
        result: existing?.result || null,
        ts: existing?.ts ?? timestamp,
        startedAt: existing?.startedAt ?? timestamp,
        endedAt: existing?.endedAt,
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
