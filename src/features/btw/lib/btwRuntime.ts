import type { BTWSessionState } from "@/features/btw/lib/btwTypes";
import type { ApiResponse, BTWInterruptResponse } from "@/shared/data";

export interface BTWRuntimeIdentity {
  session: BTWSessionState;
  generation: number;
}

export function isCurrentBTWRuntime<T extends BTWRuntimeIdentity>(
  runtimes: ReadonlyMap<string, T>,
  runtime: T,
  generation?: number,
): boolean {
  return (
    runtimes.get(runtime.session.parentChatId) === runtime &&
    (generation === undefined || runtime.generation === generation)
  );
}

export function claimRestoredBTWRun(
  restoredRunIds: Set<string>,
  session: Pick<BTWSessionState, "status" | "runId">,
): boolean {
  if (
    session.status !== "running" ||
    !session.runId ||
    !restoredRunIds.has(session.runId)
  ) {
    return false;
  }
  restoredRunIds.delete(session.runId);
  return true;
}

export function isAcceptedBTWInterrupt(
  response: ApiResponse<BTWInterruptResponse>,
  runId: string,
): boolean {
  return (
    response.data?.accepted === true &&
    response.data.runId === runId
  );
}

export type BTWInterruptSettlement = "accepted" | "rejected" | "stale";

export function settleBTWInterrupt<T extends BTWRuntimeIdentity>(input: {
  runtimes: ReadonlyMap<string, T>;
  runtime: T;
  generation: number;
  runId: string;
  accepted: boolean;
}): BTWInterruptSettlement {
  const { runtime } = input;
  if (
    !isCurrentBTWRuntime(input.runtimes, runtime, input.generation) ||
    runtime.session.runId !== input.runId ||
    runtime.session.status !== "running"
  ) {
    return "stale";
  }

  runtime.session.interruptPending = false;
  if (!input.accepted) return "rejected";

  runtime.session.projection.abortController?.abort();
  runtime.session.interruptReady = false;
  runtime.session.status = "idle";
  runtime.session.error = "";
  return "accepted";
}

export function discardBTWSessionRegistry<T extends BTWRuntimeIdentity>(input: {
  parentChatId: string;
  sessions: ReadonlyMap<string, BTWSessionState>;
  runtimes: Map<string, T>;
  restoredRunIds: Set<string>;
}): {
  removed: boolean;
  nextSessions: Map<string, BTWSessionState>;
} {
  const parentChatId = String(input.parentChatId || "").trim();
  const nextSessions = new Map(input.sessions);
  if (!parentChatId) {
    return { removed: false, nextSessions };
  }

  const runtime = input.runtimes.get(parentChatId);
  const session = input.sessions.get(parentChatId);
  if (!runtime && !session) {
    return { removed: false, nextSessions };
  }

  if (runtime) runtime.generation += 1;
  input.runtimes.delete(parentChatId);
  const runId = runtime?.session.runId || session?.runId || "";
  if (runId) input.restoredRunIds.delete(runId);
  nextSessions.delete(parentChatId);
  return { removed: true, nextSessions };
}
