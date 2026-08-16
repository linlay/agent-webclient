import type { AgentEvent } from "@/app/state/types";
import type {
  TerminalAccepted,
  TerminalCompletion,
  TerminalExecution,
  TerminalOpenInput,
  TerminalTransport,
} from "@/features/transport/contracts/realtimeTransport";
import { RealtimeTransportError } from "@/features/transport/contracts/realtimeTransportErrors";
import { ensureStandaloneWsClient } from "@/features/transport/lib/standaloneWsClient";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import type { WsClient } from "@/features/transport/lib/wsClient";

const TERMINAL_EARLY_EVENT_LIMIT = 256;
const TERMINAL_STATUS_RECONNECT_MS = 2_000;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function startTerminalExecution(input: TerminalOpenInput): TerminalExecution {
  const controller = new AbortController();
  let client: WsClient | null = null;
  let streamRequestId = "";
  let streamAbort: (() => void) | null = null;
  let terminalId = "";
  let detached = false;
  let closed = false;
  let observationStopped = false;
  let acceptedSettled = false;
  let completionSettled = false;
  let lastSeq = 0;
  const earlyEvents: AgentEvent[] = [];

  let resolveAccepted!: (value: TerminalAccepted) => void;
  let rejectAccepted!: (reason: unknown) => void;
  const accepted = new Promise<TerminalAccepted>((resolve, reject) => {
    resolveAccepted = resolve;
    rejectAccepted = reject;
  });

  let resolveCompletion!: (value: TerminalCompletion) => void;
  const completion = new Promise<TerminalCompletion>((resolve) => {
    resolveCompletion = resolve;
  });

  const finish = (value: TerminalCompletion) => {
    if (completionSettled) return;
    completionSettled = true;
    input.signal?.removeEventListener("abort", handleExternalAbort);
    resolveCompletion(value);
  };

  const fail = (error: unknown) => {
    const normalized =
      error instanceof Error
        ? error
        : new Error(String(error || "Terminal stream failed"));
    if (!acceptedSettled) {
      acceptedSettled = true;
      rejectAccepted(normalized);
    }
    finish({ reason: "error", lastSeq, error: normalized });
  };

  const accept = () => {
    if (acceptedSettled || !terminalId || !streamRequestId) return;
    acceptedSettled = true;
    resolveAccepted({
      requestId: streamRequestId,
      terminalId,
      agentKey: input.agentKey,
      terminalKey: input.terminalKey,
    });
    for (const event of earlyEvents.splice(0)) input.onEvent(event);
  };

  const onEvent = (event: AgentEvent) => {
    const seq = Number((event as Record<string, unknown>).seq ?? 0);
    if (Number.isFinite(seq)) lastSeq = Math.max(lastSeq, seq);
    if (text(event.type) === "terminal.opened") {
      terminalId = text((event as Record<string, unknown>).terminalId);
    }
    if (!acceptedSettled) {
      earlyEvents.push(event);
      if (earlyEvents.length > TERMINAL_EARLY_EVENT_LIMIT) {
        streamAbort?.();
        fail(
          new RealtimeTransportError(
            "early_event_buffer_overflow",
            "Terminal emitted too many events before terminal.opened",
          ),
        );
        return;
      }
      accept();
      return;
    }
    input.onEvent(event);
  };

  const request = async (type: string, payload: unknown): Promise<void> => {
    const activeClient = client || (await ensureStandaloneWsClient());
    client = activeClient;
    await activeClient.request({ type, payload });
  };

  const stopObservation = () => {
    if (observationStopped) return;
    observationStopped = true;
    controller.abort();
    streamAbort?.();
  };

  const detach = async () => {
    if (detached || closed || completionSettled) return;
    detached = true;
    try {
      if (streamRequestId) {
        await request(dataEndpoints.terminalDetach.path, {
          ...(terminalId ? { terminalId } : {}),
          streamRequestId,
        });
      }
    } finally {
      stopObservation();
      if (!acceptedSettled) {
        acceptedSettled = true;
        rejectAccepted(new DOMException("The terminal was detached.", "AbortError"));
      }
      finish({ reason: "detached", lastSeq });
    }
  };

  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      if (streamRequestId) {
        await request(dataEndpoints.terminalClose.path, {
          ...(terminalId ? { terminalId } : {}),
          streamRequestId,
        });
      }
    } finally {
      stopObservation();
      if (!acceptedSettled) {
        acceptedSettled = true;
        rejectAccepted(
          new RealtimeTransportError(
            "terminal_identity_missing",
            "Terminal closed before terminal.opened",
          ),
        );
      }
      finish({ reason: "closed", lastSeq });
    }
  };

  const handleExternalAbort = () => void detach();
  if (input.signal) {
    if (input.signal.aborted) void detach();
    else input.signal.addEventListener("abort", handleExternalAbort, { once: true });
  }

  void ensureStandaloneWsClient()
    .then((resolvedClient) => {
      if (detached || closed) return;
      client = resolvedClient;
      const stream = resolvedClient.stream({
        type: dataEndpoints.terminalOpen.path,
        payload: {
          agentKey: input.agentKey,
          terminalKey: input.terminalKey,
          cols: Math.max(1, input.cols),
          rows: Math.max(1, input.rows),
        },
        signal: controller.signal,
        onEvent,
        onDone: (reason, finalSeq) => {
          lastSeq = Math.max(lastSeq, Number(finalSeq) || 0);
          if (!acceptedSettled) {
            fail(
              new RealtimeTransportError(
                "terminal_identity_missing",
                "Terminal stream ended before terminal.opened",
              ),
            );
            return;
          }
          finish({ reason: reason || "done", lastSeq });
        },
        onError: (error) => {
          if (detached || closed || error.name === "AbortError") return;
          fail(error);
        },
      });
      streamRequestId = stream.requestId;
      streamAbort = stream.abort;
      accept();
    })
    .catch(fail);

  return {
    accepted,
    completion,
    getTerminalId: () => terminalId,
    write: async (data) => {
      if (!data) return;
      const identity = await accepted;
      await request(dataEndpoints.terminalInput.path, {
        terminalId: identity.terminalId,
        data,
      });
    },
    resize: async (cols, rows) => {
      const identity = await accepted;
      await request(dataEndpoints.terminalResize.path, {
        terminalId: identity.terminalId,
        cols: Math.max(1, cols),
        rows: Math.max(1, rows),
      });
    },
    detach,
    close,
  };
}

export class StandaloneTerminalTransport implements TerminalTransport {
  private readonly statusListeners = new Set<(event: AgentEvent) => void>();
  private statusClient: WsClient | null = null;
  private statusRequestId = "";
  private statusAbort: (() => void) | null = null;
  private connecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  open(input: TerminalOpenInput): TerminalExecution {
    return startTerminalExecution(input);
  }

  subscribeStatus(listener: (event: AgentEvent) => void): () => void {
    this.statusListeners.add(listener);
    void this.ensureStatusStream();
    return () => {
      this.statusListeners.delete(listener);
      if (this.statusListeners.size === 0) void this.stopStatusStream();
    };
  }

  dispose(): void {
    this.disposed = true;
    this.statusListeners.clear();
    void this.stopStatusStream();
  }

  private scheduleReconnect(): void {
    if (
      this.disposed ||
      this.reconnectTimer ||
      this.statusListeners.size === 0
    ) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureStatusStream();
    }, TERMINAL_STATUS_RECONNECT_MS);
  }

  private async ensureStatusStream(): Promise<void> {
    if (
      this.disposed ||
      this.connecting ||
      this.statusAbort ||
      this.statusListeners.size === 0
    ) {
      return;
    }
    this.connecting = true;
    try {
      const client = await ensureStandaloneWsClient();
      if (this.disposed || this.statusListeners.size === 0) return;
      this.statusClient = client;
      const stream = client.stream({
        type: dataEndpoints.terminalStatus.path,
        payload: {},
        onEvent: (event) => {
          for (const listener of this.statusListeners) listener(event);
        },
        onDone: () => {
          this.statusAbort = null;
          this.statusRequestId = "";
          this.scheduleReconnect();
        },
        onError: (error) => {
          this.statusAbort = null;
          this.statusRequestId = "";
          if (error.name !== "AbortError") this.scheduleReconnect();
        },
      });
      this.statusRequestId = stream.requestId;
      this.statusAbort = stream.abort;
    } catch {
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private async stopStatusStream(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const client = this.statusClient;
    const requestId = this.statusRequestId;
    const abort = this.statusAbort;
    this.statusClient = null;
    this.statusRequestId = "";
    this.statusAbort = null;
    if (!abort) return;
    try {
      if (client && requestId) {
        await client.request({
          type: dataEndpoints.terminalStatusDetach.path,
          payload: { streamRequestId: requestId },
        });
      }
    } catch {
      // Local teardown must still complete.
    } finally {
      abort();
    }
  }
}
