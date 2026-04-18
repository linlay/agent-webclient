import type { Dispatch } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { AgentEvent } from "@/app/state/types";
import {
  ApiError,
  createQueryStream,
  type QueryStreamParams,
} from "@/shared/api/apiClient";

export interface ExecuteQueryStreamSseOptions {
  params: QueryStreamParams;
  dispatch: Dispatch<AppAction>;
  handleEvent: (event: AgentEvent) => void;
}

interface ParsedSseFrame {
  event?: string;
  data: string;
}

function toApiErrorFromText(
  rawText: string,
  status: number,
  fallbackMessage: string,
): ApiError {
  const trimmed = String(rawText || "").trim();
  if (!trimmed) {
    return new ApiError(fallbackMessage, {
      status,
      data: rawText,
    });
  }

  try {
    const json = JSON.parse(trimmed) as Record<string, unknown>;
    return new ApiError(
      typeof json.msg === "string" && json.msg.trim()
        ? json.msg.trim()
        : fallbackMessage,
      {
        status,
        code:
          typeof json.code === "number" || typeof json.code === "string"
            ? json.code
            : null,
        data: "data" in json ? json.data : json,
      },
    );
  } catch {
    return new ApiError(trimmed || fallbackMessage, {
      status,
      data: rawText,
    });
  }
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
  return parsed as AgentEvent;
}

async function consumeSseStream(
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

export async function executeQueryStreamSse(
  options: ExecuteQueryStreamSseOptions,
): Promise<void> {
  const { dispatch, handleEvent, params } = options;
  const abortController = new AbortController();
  const externalSignal = params.signal;
  const forwardAbort = () => abortController.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortController.abort();
    } else {
      externalSignal.addEventListener("abort", forwardAbort, {
        once: true,
      });
    }
  }

  dispatch({ type: "SET_REQUEST_ID", requestId: params.requestId });
  dispatch({ type: "SET_STREAMING", streaming: true });
  dispatch({
    type: "SET_ABORT_CONTROLLER",
    controller: abortController,
  });

  try {
    const response = await createQueryStream({
      ...params,
      signal: abortController.signal,
    });
    await consumeSseStream(response, dispatch, handleEvent);
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      throw error;
    }
  } finally {
    if (externalSignal) {
      externalSignal.removeEventListener("abort", forwardAbort);
    }
    dispatch({ type: "SET_STREAMING", streaming: false });
    dispatch({ type: "SET_ABORT_CONTROLLER", controller: null });
  }
}
