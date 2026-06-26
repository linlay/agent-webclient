import type { ApiResponse } from "@/shared/data";

type EventWithRunId = {
  type?: unknown;
  runId?: unknown;
};

export type SteerSubmissionResult = {
  accepted: boolean;
  status: string;
  detail: string;
};

const TERMINAL_RUN_EVENT_TYPES = new Set([
  "run.cancel",
  "run.complete",
  "run.error",
  "run.expired",
  "run.interrupt",
  "run.stopped",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeSteerSubmissionResponse(
  response: ApiResponse | null | undefined,
): SteerSubmissionResult {
  const data = isRecord(response?.data) ? response.data : {};
  if (typeof data.accepted !== "boolean") {
    return {
      accepted: false,
      status: "invalid_response",
      detail: String(data.detail || response?.msg || "").trim(),
    };
  }

  const accepted = data.accepted;
  const status = String(data.status || (accepted ? "accepted" : "unmatched"));
  const detail = String(data.detail || response?.msg || "").trim();

  return {
    accepted,
    status,
    detail,
  };
}

export function resolveActiveRunId(input: {
  stateRunId?: unknown;
  events: EventWithRunId[];
}): string {
  const stateRunId = String(input.stateRunId || "").trim();

  if (stateRunId) {
    for (let i = input.events.length - 1; i >= 0; i -= 1) {
      const event = input.events[i];
      const runId = String(event.runId || "").trim();
      if (runId !== stateRunId) continue;

      const type = String(event.type || "").trim();
      return TERMINAL_RUN_EVENT_TYPES.has(type) ? "" : stateRunId;
    }
    return stateRunId;
  }

  for (let i = input.events.length - 1; i >= 0; i -= 1) {
    const event = input.events[i];
    const runId = String(event.runId || "").trim();
    if (!runId) continue;

    const type = String(event.type || "").trim();
    return TERMINAL_RUN_EVENT_TYPES.has(type) ? "" : runId;
  }

  return "";
}
