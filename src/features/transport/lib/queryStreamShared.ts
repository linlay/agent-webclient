import type { Dispatch } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { AgentEvent } from "@/app/state/types";
import {
  ApiError,
  type AttachStreamParams,
  type QueryStreamParams,
} from "@/shared/data";
import { formatPlatformErrorForDisplay } from "@/shared/data/platformError";

export interface ExecuteQueryStreamOptions {
  params: QueryStreamParams;
  dispatch: Dispatch<AppAction>;
  handleEvent: (event: AgentEvent) => void;
}

export interface ExecuteAttachRunOptions {
  params: AttachStreamParams;
  dispatch: Dispatch<AppAction>;
  handleEvent: (event: AgentEvent) => void;
}

export type QueryStreamExecutor = (
  options: ExecuteQueryStreamOptions,
) => Promise<void>;

export type AttachStreamExecutor = (
  options: ExecuteAttachRunOptions,
) => Promise<void>;

export interface StreamAbortScope {
  abortController: AbortController;
  cleanup: () => void;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object";
}

export function createStreamAbortScope(
  externalSignal?: AbortSignal,
): StreamAbortScope {
  const abortController = new AbortController();
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

  return {
    abortController,
    cleanup: () => {
      externalSignal?.removeEventListener("abort", forwardAbort);
    },
  };
}

export function startQueryStreamState(
  dispatch: Dispatch<AppAction>,
  requestId: string,
  abortController: AbortController,
): void {
  dispatch({ type: "SET_REQUEST_ID", requestId });
  dispatch({ type: "SET_STREAMING", streaming: true });
  dispatch({
    type: "SET_ABORT_CONTROLLER",
    controller: abortController,
  });
}

export function stopQueryStreamState(dispatch: Dispatch<AppAction>): void {
  dispatch({ type: "SET_STREAMING", streaming: false });
  dispatch({ type: "SET_ABORT_CONTROLLER", controller: null });
}

export function toApiErrorFromText(
  rawText: string,
  status: number,
  fallbackMessage: string,
): ApiError {
  const trimmed = String(rawText || "").trim();
  if (!trimmed) {
    const display = formatPlatformErrorForDisplay({ status, message: fallbackMessage });
    return new ApiError(display.message, {
      status,
      data: rawText,
      platformError: display.error,
    });
  }

  try {
    const json = JSON.parse(trimmed) as unknown;
    if (!isObjectRecord(json)) {
      const display = formatPlatformErrorForDisplay({
        status,
        message: fallbackMessage,
        raw: rawText,
      });
      return new ApiError(display.message, {
        status,
        data: rawText,
        platformError: display.error,
      });
    }
    const display = formatPlatformErrorForDisplay({
      ...json,
      status,
      ...(!(typeof json.message === "string" && json.message.trim())
        ? { message: fallbackMessage }
        : {}),
    });
    return new ApiError(display.message, {
      status: display.status ?? status,
      code:
        display.code ||
        (typeof json.code === "number" || typeof json.code === "string"
          ? json.code
          : null),
      data: "data" in json ? json.data : json,
      platformError: display.error,
    });
  } catch {
    const display = formatPlatformErrorForDisplay({
      status,
      message: fallbackMessage,
      raw: rawText,
    });
    return new ApiError(display.message, {
      status,
      data: rawText,
      platformError: display.error,
    });
  }
}
