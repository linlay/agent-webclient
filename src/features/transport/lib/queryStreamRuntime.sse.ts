import type { Dispatch } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { AgentEvent } from "@/app/state/types";
import { readEpochMillis } from "@/shared/utils/platformTime";
import {
  createAttachStream,
  createBTWStream,
  createQueryStream,
} from "@/shared/data";
import {
  createStreamAbortScope,
  startQueryStreamState,
  stopQueryStreamState,
  toApiErrorFromText,
  type ExecuteAttachRunOptions,
  type ExecuteBTWStreamOptions,
  type ExecuteQueryStreamOptions,
} from "@/features/transport/lib/queryStreamShared";

export type ExecuteQueryStreamSseOptions = ExecuteQueryStreamOptions;
export type ExecuteAttachRunSseOptions = ExecuteAttachRunOptions;
export type ExecuteBTWStreamSseOptions = ExecuteBTWStreamOptions;

interface ParsedSseFrame {
  event?: string;
  data: string;
}

const STRUCTURED_TIME_FIELDS = [
  "createdAt",
  "updatedAt",
  "startedAt",
  "completedAt",
  "timestamp",
  "expiresAt",
  "readAt",
] as const;

function hasValidPresentTimeFields(record: Record<string, unknown>): boolean {
  return STRUCTURED_TIME_FIELDS.every((field) =>
    record[field] === undefined || readEpochMillis(record[field]) !== undefined,
  );
}

function parseSseFrame(block: string): ParsedSseFrame | null {
  const lines = block.split(/\r?\n/);
  let eventName = "";
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    if (!rawLine || rawLine.startsWith(":")) {
      continue;
    }
    if (rawLine.startsWith("event:")) {
      eventName = rawLine.slice(6).trim();
      continue;
    }
    if (rawLine.startsWith("data:")) {
      dataLines.push(rawLine.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event: eventName || undefined,
    data: dataLines.join("\n"),
  };
}

function toAgentEvent(frame: ParsedSseFrame): AgentEvent | null {
  if (!frame.data || frame.data === "[DONE]") {
    return null;
  }

  const parsed = JSON.parse(frame.data) as Record<string, unknown>;
  if (
    frame.event &&
    (typeof parsed.type !== "string" || !String(parsed.type).trim())
  ) {
    parsed.type = frame.event;
  }
  const timestamp = readEpochMillis(parsed.timestamp);
  if (!hasValidPresentTimeFields(parsed) || timestamp === undefined) {
    throw new Error("time_contract_violation: stream event requires epoch_ms_int64 timestamp");
  }
  parsed.timestamp = timestamp;
  return parsed as AgentEvent;
}

export async function consumeSseStream(
  response: Response,
  dispatch: Dispatch<AppAction>,
  handleEvent: (event: AgentEvent) => void,
): Promise<void> {
  if (!response.ok) {
    const rawText = await response.text();
    throw toApiErrorFromText(rawText, response.status, `HTTP ${response.status}`);
  }

  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushBlock = (block: string) => {
    const frame = parseSseFrame(block);
    if (!frame) {
      return;
    }
    try {
      const event = toAgentEvent(frame);
      if (event) {
        handleEvent(event);
      }
    } catch (error) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[sse] Failed to parse event: ${(error as Error).message}`,
      });
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), {
        stream: !done,
      });

      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || "";
      for (const block of blocks) {
        flushBlock(block);
      }

      if (done) {
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (buffer.trim()) {
    flushBlock(buffer);
  }
}

interface RunStreamParams {
  requestId: string;
  signal?: AbortSignal;
}

async function executeRunStreamSse<TParams extends RunStreamParams>(input: {
  params: TParams;
  dispatch: Dispatch<AppAction>;
  handleEvent: (event: AgentEvent) => void;
  createStream: (params: TParams & { signal: AbortSignal }) => Promise<Response>;
  onResponse?: (response: Response) => void;
}): Promise<void> {
  const { dispatch, handleEvent, params, createStream, onResponse } = input;
  const { abortController, cleanup } = createStreamAbortScope(params.signal);

  startQueryStreamState(dispatch, params.requestId, abortController);

  try {
    const response = await createStream({
      ...params,
      signal: abortController.signal,
    });
    onResponse?.(response);
    await consumeSseStream(response, dispatch, handleEvent);
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      throw error;
    }
  } finally {
    cleanup();
    stopQueryStreamState(dispatch);
  }
}

export async function executeQueryStreamSse(
  options: ExecuteQueryStreamSseOptions,
): Promise<void> {
  await executeRunStreamSse({
    ...options,
    createStream: createQueryStream,
  });
}

export async function executeBTWStreamSse(
  options: ExecuteBTWStreamSseOptions,
): Promise<void> {
  await executeRunStreamSse({
    dispatch: options.dispatch,
    handleEvent: options.handleEvent,
    params: options.params,
    createStream: createBTWStream,
    onResponse: (response) => {
      options.onIdentity?.({
        btwId: String(response.headers.get("X-Btw-Id") || "").trim(),
        runId: String(response.headers.get("X-Run-Id") || "").trim(),
      });
    },
  });
}

export async function executeAttachRunSse(
  options: ExecuteAttachRunSseOptions,
): Promise<void> {
  const { dispatch, handleEvent, params } = options;
  const { abortController, cleanup } = createStreamAbortScope(params.signal);

  try {
    const response = await createAttachStream({
      ...params,
      signal: abortController.signal,
    });
    await consumeSseStream(response, dispatch, handleEvent);
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      throw error;
    }
  } finally {
    cleanup();
  }
}
