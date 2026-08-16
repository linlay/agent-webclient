import { toText } from "@/shared/utils/eventUtils";

const TERMINAL_STATUS_EVENT_TYPE = "terminal.status";

export type TerminalStatusSession = {
  readonly terminalId: string;
  readonly agentKey: string;
  readonly terminalKey: string;
  readonly status: string;
};

export type TerminalAgentTerminalStatus = "idle" | "busy";

export type TerminalStatusEventLike = {
  readonly type?: unknown;
  readonly sessions?: unknown;
};

let terminalAgentStatuses = new Map<string, TerminalAgentTerminalStatus>();
const subscribers = new Set<
  (agentStatuses: ReadonlyMap<string, TerminalAgentTerminalStatus>) => void
>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function terminalStatusSessionFromValue(
  value: unknown,
): TerminalStatusSession | null {
  if (!isRecord(value)) return null;
  const agentKey = toText(value.agentKey);
  if (!agentKey) return null;
  return {
    terminalId: toText(value.terminalId),
    agentKey,
    terminalKey: toText(value.terminalKey) || "main",
    status: toText(value.status) || "idle",
  };
}

export function terminalStatusSessionsFromEvent(
  event: TerminalStatusEventLike,
): readonly TerminalStatusSession[] {
  if (toText(event.type) !== TERMINAL_STATUS_EVENT_TYPE) return [];
  const rawSessions = Array.isArray(event.sessions) ? event.sessions : [];
  return rawSessions.flatMap((value) => {
    const session = terminalStatusSessionFromValue(value);
    return session ? [session] : [];
  });
}

export function terminalBusyAgentKeysFromStatusSessions(
  sessions: readonly TerminalStatusSession[],
): Set<string> {
  return new Set(
    sessions
      .filter((session) => session.status === "busy")
      .map((session) => session.agentKey),
  );
}

export function terminalBusyAgentKeysFromStatusEvent(
  event: TerminalStatusEventLike,
): Set<string> {
  return terminalBusyAgentKeysFromStatusSessions(
    terminalStatusSessionsFromEvent(event),
  );
}

export function terminalAgentStatusesFromStatusSessions(
  sessions: readonly TerminalStatusSession[],
): Map<string, TerminalAgentTerminalStatus> {
  const next = new Map<string, TerminalAgentTerminalStatus>();
  for (const session of sessions) {
    if (session.status === "busy") {
      next.set(session.agentKey, "busy");
    } else if (!next.has(session.agentKey)) {
      next.set(session.agentKey, "idle");
    }
  }
  return next;
}

export function terminalAgentStatusesFromStatusEvent(
  event: TerminalStatusEventLike,
): Map<string, TerminalAgentTerminalStatus> {
  return terminalAgentStatusesFromStatusSessions(
    terminalStatusSessionsFromEvent(event),
  );
}

export function terminalAgentKeysFromStatusSessions(
  sessions: readonly TerminalStatusSession[],
): Set<string> {
  return new Set(terminalAgentStatusesFromStatusSessions(sessions).keys());
}

export function terminalAgentKeysFromStatusEvent(
  event: TerminalStatusEventLike,
): Set<string> {
  return terminalAgentKeysFromStatusSessions(terminalStatusSessionsFromEvent(event));
}

export function getTerminalAgentStatuses(): ReadonlyMap<
  string,
  TerminalAgentTerminalStatus
> {
  return terminalAgentStatuses;
}

export function getActiveTerminalAgentKeys(): ReadonlySet<string> {
  return new Set(terminalAgentStatuses.keys());
}

export function publishTerminalStatusEvent(event: TerminalStatusEventLike): void {
  if (toText(event.type) !== TERMINAL_STATUS_EVENT_TYPE) return;
  terminalAgentStatuses = terminalAgentStatusesFromStatusEvent(event);
  for (const subscriber of subscribers) subscriber(terminalAgentStatuses);
}

export function notifyTerminalActivityChanged(): void {
  for (const subscriber of subscribers) subscriber(terminalAgentStatuses);
}

export function subscribeTerminalActivity(
  subscriber: (
    agentStatuses: ReadonlyMap<string, TerminalAgentTerminalStatus>,
  ) => void,
): () => void {
  subscribers.add(subscriber);
  subscriber(terminalAgentStatuses);
  return () => subscribers.delete(subscriber);
}

export function resetTerminalActivityForTests(): void {
  terminalAgentStatuses = new Map();
  subscribers.clear();
}
