import type {
  AgentEvent,
  FileContentSnapshot,
  FileChangeSummary,
  ToolState,
} from "@/app/state/types";
import type {
  EventCommand,
  EventProcessorState,
} from "@/features/timeline/lib/eventProcessorTypes";
import { parseFrontendToolParams } from "@/features/tools/lib/frontendToolParams";
import { toText } from "@/shared/utils/eventUtils";
import {
  pickToolName,
  resolveViewportKey,
} from "@/features/timeline/lib/toolEvent";
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

function isFileReadToolName(toolName: string): boolean {
  return toolName.trim().toLowerCase() === "file_read";
}

function readRecordText(
  record: Record<string, unknown> | null,
  keys: string[],
): string {
  if (!record) {
    return "";
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return "";
}

function readFilePathFromRecords(
  ...records: Array<Record<string, unknown> | null>
): string {
  for (const record of records) {
    const filePath = readRecordText(record, ["filePath", "file_path", "path"]);
    if (filePath.trim()) {
      return filePath.trim();
    }
  }
  return "";
}

function parseToolArgsRecord(argsText: string): Record<string, unknown> | null {
  const parsed = parseResultJSON(argsText);
  return isObjectRecord(parsed) ? parsed : null;
}

function applyFileEditToContent(
  content: string,
  argsRecord: Record<string, unknown> | null,
): string {
  const oldString = readRecordText(argsRecord, ["oldString", "old_string"]);
  const newString = readRecordText(argsRecord, ["newString", "new_string"]);
  if (!oldString || oldString === newString) {
    return content;
  }
  const index = content.indexOf(oldString);
  if (index < 0) {
    return content;
  }
  return `${content.slice(0, index)}${newString}${content.slice(index + oldString.length)}`;
}

function normalizeFileContentSnapshot(input: {
  toolName: string;
  resultValue: unknown;
  argsText: string;
  timestamp: number;
  runId: string;
  previous?: FileContentSnapshot;
}): FileContentSnapshot | null {
  const toolName = input.toolName.trim().toLowerCase();
  const resultRecord = parseResultObject(input.resultValue);
  const argsRecord = parseToolArgsRecord(input.argsText);
  const filePath = readFilePathFromRecords(resultRecord, argsRecord);
  if (!filePath) {
    return null;
  }

  const timestamp =
    Number.isFinite(input.timestamp) && input.timestamp > 0
      ? input.timestamp
      : Date.now();
  const runId = input.runId.trim() || input.previous?.runId || "";

  if (toolName === "file_read") {
    const content =
      readRecordText(resultRecord, ["content", "text", "data"]) ||
      (typeof input.resultValue === "string" && !resultRecord
        ? input.resultValue
        : "");
    return {
      runId,
      filePath,
      originalContent: content,
      currentContent: content,
      lastUpdatedAt: timestamp,
    };
  }

  if (toolName === "file_write") {
    const content = readRecordText(argsRecord, ["content", "contents", "text"]);
    if (!content && !input.previous) {
      return null;
    }
    return {
      runId,
      filePath,
      originalContent: input.previous?.originalContent || "",
      currentContent: content,
      lastUpdatedAt: timestamp,
    };
  }

  if (toolName === "file_edit") {
    const baseContent = input.previous?.currentContent || "";
    return {
      runId,
      filePath,
      originalContent: input.previous?.originalContent || baseContent,
      currentContent: applyFileEditToContent(baseContent, argsRecord),
      lastUpdatedAt: timestamp,
    };
  }

  return null;
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
    lastUpdatedAt:
      Number.isFinite(input.timestamp) && input.timestamp > 0
        ? input.timestamp
        : Date.now(),
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
    const argsText = resolvedParams
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
        status: type === "tool.snapshot" ? "completed" : "start",
        result: existing?.result || null,
        ts: event.timestamp || existing?.ts || Date.now(),
        startedAt:
          existing?.startedAt || event.timestamp || existing?.ts || Date.now(),
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
        argsText: parsedToolParams
          ? JSON.stringify(parsedToolParams, null, 2)
          : nextArgsBuffer || existingNode?.argsText || "",
       status: "running",
       result: existingNode?.result || null,
       ts: event.timestamp || existingNode?.ts || Date.now(),
        startedAt: existingNode?.startedAt,
        endedAt: existingNode?.endedAt,
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
    const argsText = resolveFinalToolArgsText(
      existing?.argsText || "",
      existingToolState?.argsBuffer || "",
      readToolArgumentsText(event),
    );
    const fileChange = failed
      ? null
      : normalizeFileChangeSummary({
          toolName: resolvedToolName,
          resultValue,
          timestamp: event.timestamp || Date.now(),
          runId: resultRunId,
        });
    const fileContentSnapshot = failed
      ? null
      : normalizeFileContentSnapshot({
          toolName: resolvedToolName,
          resultValue,
          argsText,
          timestamp: event.timestamp || Date.now(),
          runId: resultRunId,
          previous: state.getFileContentSnapshot(
            readFilePathFromRecords(
              parseResultObject(resultValue),
              parseToolArgsRecord(argsText),
            ),
          ),
        });
    const resultText =
      typeof resultValue === "string"
        ? resultValue
        : JSON.stringify(resultValue, null, 2);
    const endedAt = event.timestamp || Date.now();
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
    commands.push({
      cmd: "SET_TIMELINE_NODE",
      id: nodeId,
      node: buildToolTimelineNode({
        nodeId,
        event,
        existing,
        existingToolState,
        argsText,
        status: failed ? "failed" : "success",
        result: { text: resultText, isCode: typeof resultValue !== "string" },
        ts: existing?.ts || event.timestamp || Date.now(),
        startedAt,
        endedAt,
        durationMs,
        state,
      }),
    });
    if (fileChange) {
      commands.push({ cmd: "UPSERT_FILE_CHANGE", fileChange });
    }
    if (fileContentSnapshot) {
      commands.push({
        cmd: "UPSERT_FILE_CONTENT_SNAPSHOT",
        snapshot: fileContentSnapshot,
      });
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
