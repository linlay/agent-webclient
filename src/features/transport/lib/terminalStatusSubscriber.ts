import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { ensureStandaloneWsClient } from "@/features/transport/lib/standaloneWsClient";
import type { WsClient } from "@/features/transport/lib/wsClient";
import { dataEndpoints } from "@/shared/data/api/endpoints";

const TERMINAL_STATUS_RECONNECT_MS = 2_000;

export class StandaloneTerminalStatusSubscriber {
  private readonly statusListeners = new Set<(event: AgentEvent) => void>();
  private statusClient: WsClient | null = null;
  private statusRequestId = "";
  private statusAbort: (() => void) | null = null;
  private connecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  subscribe(listener: (event: AgentEvent) => void): () => void {
    if (this.disposed) {
      return () => undefined;
    }
    this.statusListeners.add(listener);
    void this.ensureStatusStream();
    return () => {
      this.statusListeners.delete(listener);
      if (this.statusListeners.size === 0) {
        void this.stopStatusStream();
      }
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
