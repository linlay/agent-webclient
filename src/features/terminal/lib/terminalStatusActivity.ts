import type { WsClient } from "@/features/transport/lib/wsClient";
import {
  openTerminalStatusStream,
  resolveTerminalWsClient,
  sendTerminalStatusDetach,
  type TerminalStreamHandle,
} from "@/features/terminal/lib/terminalTransport";
import { toText } from "@/shared/utils/eventUtils";

const TERMINAL_STATUS_EVENT_TYPE = "terminal.status";
const TERMINAL_STATUS_RECONNECT_MS = 2000;

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
let statusStream: TerminalStreamHandle | null = null;
let statusStreamClient: WsClient | null = null;
let statusStreamConnecting = false;
let reconnectTimer: number | null = null;

const subscribers = new Set<
  (agentStatuses: ReadonlyMap<string, TerminalAgentTerminalStatus>) => void
>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function terminalStatusSessionFromValue(
  value: unknown,
): TerminalStatusSession | null {
  if (!isRecord(value)) {
    return null;
  }
  const agentKey = toText(value["agentKey"]);
  if (!agentKey) {
    return null;
  }
  return {
    terminalId: toText(value["terminalId"]),
    agentKey,
    terminalKey: toText(value["terminalKey"]) || "main",
    status: toText(value["status"]) || "idle",
  };
}

export function terminalStatusSessionsFromEvent(
  event: TerminalStatusEventLike,
): readonly TerminalStatusSession[] {
  if (toText(event.type) !== TERMINAL_STATUS_EVENT_TYPE) {
    return [];
  }
  const rawSessions: readonly unknown[] = Array.isArray(event.sessions)
    ? event.sessions
    : [];
  const sessions: TerminalStatusSession[] = [];
  for (const rawSession of rawSessions) {
    const session = terminalStatusSessionFromValue(rawSession);
    if (session) {
      sessions.push(session);
    }
  }
  return sessions;
}

export function terminalBusyAgentKeysFromStatusSessions(
  sessions: readonly TerminalStatusSession[],
): Set<string> {
  const next = new Set<string>();
  for (const session of sessions) {
    if (session.status !== "busy") {
      continue;
    }
    if (session.agentKey) {
      next.add(session.agentKey);
    }
  }
  return next;
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
    if (!session.agentKey) {
      continue;
    }
    if (session.status === "busy") {
      next.set(session.agentKey, "busy");
      continue;
    }
    if (!next.has(session.agentKey)) {
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
  return terminalAgentKeysFromStatusSessions(
    terminalStatusSessionsFromEvent(event),
  );
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

function publish(
  agentStatuses: Map<string, TerminalAgentTerminalStatus>,
): void {
  terminalAgentStatuses = agentStatuses;
  for (const subscriber of subscribers) {
    subscriber(terminalAgentStatuses);
  }
}

function reportTerminalStatusStreamError(error: unknown): void {
  if (error instanceof Error) {
    console.debug("terminal status stream failed", error.message);
    return;
  }
  console.debug("terminal status stream failed", String(error || "unknown error"));
}

function clearTerminalStatusReconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleTerminalStatusReconnect(): void {
  if (
    typeof window === "undefined" ||
    reconnectTimer ||
    statusStream ||
    subscribers.size === 0
  ) {
    return;
  }
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    void ensureTerminalStatusStream();
  }, TERMINAL_STATUS_RECONNECT_MS);
}

function stopTerminalStatusStream(): void {
  clearTerminalStatusReconnect();
  const stream = statusStream;
  const client = statusStreamClient;
  statusStream = null;
  statusStreamClient = null;
  statusStreamConnecting = false;
  if (!stream) {
    return;
  }
  if (!client) {
    stream.abort();
    return;
  }
  void sendTerminalStatusDetach(client, { streamRequestId: stream.requestId })
    .catch(reportTerminalStatusStreamError)
    .finally(() => {
      stream.abort();
    });
}

export async function ensureTerminalStatusStream(): Promise<void> {
  if (
    typeof window === "undefined" ||
    statusStream ||
    statusStreamConnecting ||
    subscribers.size === 0
  ) {
    return;
  }

  statusStreamConnecting = true;
  try {
    const client = await resolveTerminalWsClient();
    if (subscribers.size === 0) {
      return;
    }

    let requestId = "";
    const stream = openTerminalStatusStream(client, {
      onEvent: (event) => {
        if (toText(event.type) === TERMINAL_STATUS_EVENT_TYPE) {
          publish(terminalAgentStatusesFromStatusEvent(event));
        }
      },
      onDone: () => {
        if (statusStream?.requestId !== requestId) {
          return;
        }
        statusStream = null;
        statusStreamClient = null;
        publish(new Map());
        scheduleTerminalStatusReconnect();
      },
      onError: (error) => {
        if (statusStream?.requestId !== requestId) {
          return;
        }
        statusStream = null;
        statusStreamClient = null;
        if (error.name !== "AbortError") {
          reportTerminalStatusStreamError(error);
          publish(new Map());
          scheduleTerminalStatusReconnect();
        }
      },
    });
    requestId = stream.requestId;
    statusStream = stream;
    statusStreamClient = client;
    clearTerminalStatusReconnect();
  } catch (error) {
    if (error instanceof Error) {
      reportTerminalStatusStreamError(error);
      publish(new Map());
      scheduleTerminalStatusReconnect();
      return;
    }
    reportTerminalStatusStreamError(error);
    publish(new Map());
    scheduleTerminalStatusReconnect();
  } finally {
    statusStreamConnecting = false;
  }
}

export function notifyTerminalActivityChanged(): void {
  void ensureTerminalStatusStream();
}

export function subscribeTerminalActivity(
  subscriber: (
    agentStatuses: ReadonlyMap<string, TerminalAgentTerminalStatus>,
  ) => void,
): () => void {
  subscribers.add(subscriber);
  subscriber(terminalAgentStatuses);
  void ensureTerminalStatusStream();
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) {
      stopTerminalStatusStream();
    }
  };
}

export function resetTerminalActivityForTests(): void {
  clearTerminalStatusReconnect();
  statusStream?.abort();
  terminalAgentStatuses = new Map();
  statusStream = null;
  statusStreamClient = null;
  statusStreamConnecting = false;
  subscribers.clear();
}
