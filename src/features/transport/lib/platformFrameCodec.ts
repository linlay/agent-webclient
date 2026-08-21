import type { AgentEvent } from "@/app/state/types";
import { ApiError, type ApiResponse } from "@/shared/data/api/client";
import { formatPlatformErrorForDisplay } from "@/shared/data/errors/platformError";
import {
  readEpochMillis,
  STRUCTURED_PLATFORM_TIME_FIELDS,
} from "@/shared/utils/platformTime";

export type PlatformResponseFrame = {
  frame: "response";
  type?: string;
  id?: string;
  code?: number | string;
  status?: number;
  msg?: string;
  data?: unknown;
};

export type PlatformErrorFrame = {
  frame: "error";
  id?: string;
  type?: string;
  code?: number | string;
  status?: number;
  msg?: string;
  error?: string;
  data?: unknown;
};

export type PlatformStreamEventFrame = {
  type?: string;
  seq?: number;
  payload?: unknown;
  [key: string]: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hasValidPresentTimeFields(value: Record<string, unknown>): boolean {
  return STRUCTURED_PLATFORM_TIME_FIELDS.every(
    (field) => value[field] === undefined || readEpochMillis(value[field]) !== undefined,
  );
}

export function decodePlatformApiError(
  frame: PlatformErrorFrame | PlatformResponseFrame,
): ApiError {
  const display = formatPlatformErrorForDisplay(frame);
  return new ApiError(display.message, {
    status: display.status ?? frame.status ?? null,
    code: display.code || (frame.code ?? null),
    data: frame.data ?? null,
    platformError: display.error,
  });
}

export function decodePlatformApiResponse<T>(
  frame: PlatformResponseFrame,
): ApiResponse<T> {
  const code = typeof frame.code === "number"
    ? frame.code
    : Number.isFinite(Number(frame.code))
      ? Number(frame.code)
      : 0;
  if (code !== 0) throw decodePlatformApiError(frame);
  return {
    status: typeof frame.status === "number" ? frame.status : 200,
    code,
    msg: typeof frame.msg === "string" ? frame.msg : "ok",
    data: (frame.data ?? null) as T,
  };
}

export function decodePlatformAgentEvent(
  frameEvent: PlatformStreamEventFrame,
): AgentEvent | null {
  const { payload, ...rest } = frameEvent;
  const payloadRecord = record(payload);
  const event = {
    ...payloadRecord,
    ...rest,
    type: String(frameEvent.type || payloadRecord.type || ""),
    seq: typeof frameEvent.seq === "number"
      ? frameEvent.seq
      : Number(payloadRecord.seq ?? 0) || undefined,
  } as AgentEvent;
  const timestamp = readEpochMillis(event.timestamp);
  return !hasValidPresentTimeFields(event) || timestamp === undefined
    ? null
    : { ...event, timestamp };
}
