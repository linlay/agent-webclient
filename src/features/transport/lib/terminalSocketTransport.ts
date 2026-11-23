import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type {
  TerminalAccepted,
  TerminalCompletion,
  TerminalExecution,
  TerminalOpenInput,
  TerminalTransport,
} from "@/features/transport/contracts/realtimeTransport";
import {
  RealtimeTransportError,
  type RealtimeTransportErrorCode,
} from "@/features/transport/contracts/realtimeTransportErrors";
import { dataEndpoints } from "@/shared/data/api/endpoints";

export const TERMINAL_WS_PROTOCOL_VERSION = 1;

export const TERMINAL_WS_OP = {
  OPEN: 0x01,
  INPUT: 0x02,
  RESIZE: 0x03,
  ACK: 0x04,
  DETACH: 0x05,
  CLOSE: 0x06,
  OUTPUT: 0x81,
  EVENT: 0x82,
} as const;

export const TERMINAL_ACK_BATCH_BYTES = 64 * 1024;
export const TERMINAL_CLOSE_ACK_TIMEOUT_MS = 1_500;
const TERMINAL_RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000] as const;

export type TerminalSocketTransportOptions = {
  resolveAccessToken?: (reason?: "missing" | "unauthorized") => Promise<string>;
  getDeviceId?: () => string;
  subscribeStatus?: (listener: (event: AgentEvent) => void) => () => void;
  disposeStatus?: () => void;
  webSocketFactory?: (url: string, protocols?: string | string[]) => WebSocket;
  closeAckTimeoutMs?: number;
};

const KNOWN_ERROR_CODES = new Set<string>([
  "invalid_request",
  "forbidden",
  "terminal_not_found",
  "conflict",
  "unsupported",
  "too_many_requests",
  "internal_error",
  "protocol_version_mismatch",
]);

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildTerminalWsUrl(): string {
  if (typeof window === "undefined") {
    throw new RealtimeTransportError(
      "terminal_ws_handshake_failed",
      "Terminal WebSocket requires a browser window context.",
    );
  }
  const url = new URL(dataEndpoints.terminalWs.path, window.location.href);
  if (
    url.origin !== window.location.origin ||
    url.pathname !== dataEndpoints.terminalWs.path ||
    url.search ||
    url.hash
  ) {
    throw new RealtimeTransportError(
      "terminal_ws_handshake_failed",
      `Invalid terminal WebSocket path (${dataEndpoints.terminalWs.path}).`,
    );
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

function defaultWebSocketFactory(url: string, protocols?: string | string[]): WebSocket {
  return protocols !== undefined ? new WebSocket(url, protocols) : new WebSocket(url);
}

function encodeFrame(opcode: number, payload?: Uint8Array): Uint8Array {
  const length = payload ? payload.byteLength : 0;
  const frame = new Uint8Array(1 + length);
  frame[0] = opcode;
  if (payload && length > 0) {
    frame.set(payload, 1);
  }
  return frame;
}

function encodeResizeFrame(cols: number, rows: number): Uint8Array {
  const frame = new Uint8Array(5);
  frame[0] = TERMINAL_WS_OP.RESIZE;
  const view = new DataView(frame.buffer);
  view.setUint16(1, Math.max(1, Math.min(0xffff, Math.trunc(cols) || 1)), false);
  view.setUint16(3, Math.max(1, Math.min(0xffff, Math.trunc(rows) || 1)), false);
  return frame;
}

function encodeAckFrame(bytes: number): Uint8Array {
  const frame = new Uint8Array(5);
  frame[0] = TERMINAL_WS_OP.ACK;
  const view = new DataView(frame.buffer);
  view.setUint32(1, Math.max(0, Math.min(0xffffffff, Math.trunc(bytes) || 0)), false);
  return frame;
}

function toTerminalError(event: Record<string, unknown>): RealtimeTransportError {
  const rawCode = normalizeText(event.code);
  const status = typeof event.status === "number" ? event.status : 0;
  const serverVersion = typeof event.serverVersion === "number" ? event.serverVersion : undefined;
  const rawMessage = normalizeText(event.message);
  if (rawCode === "protocol_version_mismatch" || status === 426) {
    const versionInfo = serverVersion !== undefined
      ? ` (client v${TERMINAL_WS_PROTOCOL_VERSION}, server v${serverVersion})`
      : "";
    return new RealtimeTransportError(
      "protocol_version_mismatch",
      `Terminal protocol version mismatch (426 Upgrade Required)${versionInfo}. Please upgrade WebClient and agent-platform to matching versions.`,
      { retryable: false, details: { status: 426, serverVersion } },
    );
  }
  const code: RealtimeTransportErrorCode = KNOWN_ERROR_CODES.has(rawCode)
    ? (rawCode as RealtimeTransportErrorCode)
    : "internal_error";
  return new RealtimeTransportError(
    code,
    rawMessage || `Terminal error (${code})`,
    {
      retryable: false,
      details: {
        serverCode: rawCode,
        ...(status ? { status } : {}),
        ...(serverVersion !== undefined ? { serverVersion } : {}),
      },
    },
  );
}

function createHandshakeError(closeCode?: number, reason?: string): RealtimeTransportError {
  const suffix = closeCode ? ` (close code ${closeCode}${reason ? `: ${reason}` : ""})` : "";
  return new RealtimeTransportError(
    "terminal_ws_handshake_failed",
    `Terminal WebSocket handshake failed at ${dataEndpoints.terminalWs.path}${suffix}. Check authentication or ensure your reverse proxy forwards WebSocket upgrades for ${dataEndpoints.terminalWs.path}.`,
    { retryable: false, details: { closeCode, reason } },
  );
}

async function readBinaryData(data: unknown): Promise<Uint8Array | null> {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  return null;
}

export class TerminalSocketTransport implements TerminalTransport {
  private readonly executions = new Set<{ stopImmediately: () => void }>();
  private disposed = false;

  constructor(private readonly options: TerminalSocketTransportOptions = {}) {}

  open(input: TerminalOpenInput): TerminalExecution {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const requestId = `termws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let latestCols = Math.max(1, input.cols || 80);
    let latestRows = Math.max(1, input.rows || 24);
    const initialCwd = normalizeText(input.cwd);
    const initialProfile = normalizeText(input.profile);
    let terminalId = "";
    let hasAccepted = false;
    let completionSettled = false;
    let stoppedByClient = false;
    let terminalExited = false;
    let fatalError: Error | null = null;
    let activeSocket: WebSocket | null = null;
    let socketOpenedSession = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let unackedBytes = 0;
    let inboundQueue: Promise<void> = Promise.resolve();
    let closePromise: Promise<void> | null = null;

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

    type ReadyWaiter = {
      resolve: (socket: WebSocket) => void;
      reject: (error: Error) => void;
    };
    const readyWaiters: ReadyWaiter[] = [];

    const flushReadyWaitersWithSocket = (socket: WebSocket) => {
      for (const waiter of readyWaiters.splice(0)) {
        waiter.resolve(socket);
      }
    };

    const rejectReadyWaiters = (error: Error) => {
      for (const waiter of readyWaiters.splice(0)) {
        waiter.reject(error);
      }
    };

    const waitForReadySocket = async (): Promise<WebSocket> => {
      await accepted;
      if (stoppedByClient || terminalExited || this.disposed) {
        throw fatalError || new DOMException("The terminal session is closed.", "AbortError");
      }
      if (fatalError) {
        throw fatalError;
      }
      if (activeSocket && activeSocket.readyState === 1 && socketOpenedSession) {
        return activeSocket;
      }
      return new Promise<WebSocket>((resolve, reject) => {
        readyWaiters.push({ resolve, reject });
      });
    };

    const finish = (value: TerminalCompletion) => {
      if (completionSettled) return;
      completionSettled = true;
      this.executions.delete(lifecycleHandle);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      input.signal?.removeEventListener("abort", handleExternalAbort);
      rejectReadyWaiters(
        value.error || new DOMException(`Terminal finished (${value.reason}).`, "AbortError"),
      );
      resolveCompletion(value);
    };

    const fail = (error: Error) => {
      fatalError = error;
      if (!hasAccepted) {
        hasAccepted = true;
        rejectAccepted(error);
      }
      finish({ reason: "error", lastSeq: 0, error });
    };

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (
        stoppedByClient ||
        terminalExited ||
        this.disposed ||
        fatalError ||
        reconnectTimer
      ) {
        return;
      }
      const delayIndex = Math.min(reconnectAttempt, TERMINAL_RECONNECT_DELAYS_MS.length - 1);
      const delay = TERMINAL_RECONNECT_DELAYS_MS[delayIndex];
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, delay);
    };

    const handleFrame = (socket: WebSocket, bytes: Uint8Array) => {
      if (socket !== activeSocket || stoppedByClient || bytes.byteLength === 0) {
        return;
      }
      const opcode = bytes[0];
      const payload = bytes.subarray(1);
      if (opcode === TERMINAL_WS_OP.OUTPUT) {
        const chunkLength = payload.byteLength;
        if (chunkLength === 0) return;
        let acked = false;
        const onWritten = () => {
          if (acked || socket !== activeSocket || stoppedByClient || socket.readyState !== 1) {
            return;
          }
          acked = true;
          unackedBytes += chunkLength;
          if (unackedBytes >= TERMINAL_ACK_BATCH_BYTES) {
            const bytesToAck = unackedBytes;
            unackedBytes = 0;
            socket.send(encodeAckFrame(bytesToAck));
          }
        };
        if (input.onOutput) {
          input.onOutput(payload.slice(), onWritten);
        } else {
          const text = decoder.decode(payload, { stream: true });
          if (text) {
            input.onEvent({
              type: "terminal.output",
              terminalId,
              data: text,
            } as unknown as AgentEvent);
          }
          onWritten();
        }
        return;
      }

      if (opcode === TERMINAL_WS_OP.EVENT) {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
        } catch {
          return;
        }
        const eventType = normalizeText(parsed.type);
        if (eventType === "terminal.opened") {
          terminalId = normalizeText(parsed.terminalId) || terminalId;
          socketOpenedSession = true;
          reconnectAttempt = 0;
          if (!hasAccepted) {
            hasAccepted = true;
            resolveAccepted({
              requestId,
              terminalId,
              agentKey: input.agentKey,
              terminalKey: input.terminalKey,
            });
          }
          flushReadyWaitersWithSocket(socket);
          input.onEvent(parsed as unknown as AgentEvent);
          return;
        }
        if (eventType === "terminal.exit") {
          terminalExited = true;
          input.onEvent(parsed as unknown as AgentEvent);
          finish({ reason: "exit", lastSeq: 0 });
          if (socket.readyState === 0 || socket.readyState === 1) {
            socket.close(1000, "exit");
          }
          return;
        }
        if (eventType === "terminal.error") {
          const error = toTerminalError(parsed);
          const status = typeof parsed.status === "number" ? parsed.status : 0;
          const isTerminalSessionFatal =
            !socketOpenedSession ||
            error.code === "protocol_version_mismatch" ||
            status === 426 ||
            status === 403 ||
            status === 404 ||
            status === 409 ||
            status === 429 ||
            status === 501;
          input.onEvent(parsed as unknown as AgentEvent);
          if (isTerminalSessionFatal) {
            fail(error);
            if (socket.readyState === 0 || socket.readyState === 1) {
              socket.close(1000, error.code);
            }
          }
          return;
        }
        input.onEvent(parsed as unknown as AgentEvent);
      }
    };

    const connect = async () => {
      if (stoppedByClient || terminalExited || this.disposed || fatalError) {
        return;
      }
      let wsUrl: string;
      let token = "";
      try {
        wsUrl = buildTerminalWsUrl();
        if (this.options.resolveAccessToken) {
          token = normalizeText(await this.options.resolveAccessToken("missing"));
        }
      } catch (error) {
        if (!hasAccepted) {
          const normalized = error instanceof Error ? error : new Error(String(error));
          queueMicrotask(() => fail(normalized));
        } else {
          scheduleReconnect();
        }
        return;
      }
      if (stoppedByClient || terminalExited || this.disposed || fatalError) {
        return;
      }

      const factory = this.options.webSocketFactory ?? defaultWebSocketFactory;
      let socket: WebSocket;
      try {
        socket = token ? factory(wsUrl, [`bearer.${token}`]) : factory(wsUrl);
      } catch (error) {
        if (!hasAccepted) {
          fail(error instanceof Error ? error : createHandshakeError());
        } else {
          scheduleReconnect();
        }
        return;
      }

      activeSocket = socket;
      socketOpenedSession = false;
      unackedBytes = 0;
      socket.binaryType = "arraybuffer";

      socket.onopen = () => {
        if (socket !== activeSocket || stoppedByClient || terminalExited || this.disposed) {
          socket.close();
          return;
        }
        const deviceId = normalizeText(this.options.getDeviceId?.());
        const openPayload: Record<string, unknown> = {
          protocolVersion: TERMINAL_WS_PROTOCOL_VERSION,
          agentKey: input.agentKey,
          terminalKey: input.terminalKey,
          ...(!hasAccepted && initialCwd ? { cwd: initialCwd } : {}),
          ...(!hasAccepted && initialProfile ? { profile: initialProfile } : {}),
          cols: latestCols,
          rows: latestRows,
          ...(deviceId ? { deviceId } : {}),
        };
        socket.send(encodeFrame(TERMINAL_WS_OP.OPEN, encoder.encode(JSON.stringify(openPayload))));
      };

      socket.onmessage = (event) => {
        if (socket !== activeSocket || stoppedByClient) return;
        if (event.data instanceof ArrayBuffer || ArrayBuffer.isView(event.data)) {
          const bytes =
            event.data instanceof ArrayBuffer
              ? new Uint8Array(event.data)
              : new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
          handleFrame(socket, bytes);
          return;
        }
        inboundQueue = inboundQueue.then(async () => {
          const bytes = await readBinaryData(event.data);
          if (bytes) {
            handleFrame(socket, bytes);
          }
        });
      };

      socket.onerror = () => {
        // Disconnect and error reporting are finalized cleanly in onclose.
      };

      socket.onclose = (closeEvent) => {
        if (socket !== activeSocket) return;
        activeSocket = null;
        socketOpenedSession = false;
        if (stoppedByClient || terminalExited || this.disposed || fatalError) {
          return;
        }
        if (!hasAccepted) {
          fail(createHandshakeError(closeEvent?.code, closeEvent?.reason));
          return;
        }
        scheduleReconnect();
      };
    };

    const detach = async () => {
      if (stoppedByClient || terminalExited || completionSettled) return;
      stoppedByClient = true;
      clearReconnectTimer();
      const socket = activeSocket;
      activeSocket = null;
      if (socket && socket.readyState === 1) {
        try {
          socket.send(encodeFrame(TERMINAL_WS_OP.DETACH));
        } catch {
          // Ignore send failures while tearing down.
        }
      }
      if (socket && (socket.readyState === 0 || socket.readyState === 1)) {
        try {
          socket.close(1000, "detached");
        } catch {
          // Ignore close errors.
        }
      }
      if (!hasAccepted) {
        hasAccepted = true;
        rejectAccepted(new DOMException("The terminal was detached.", "AbortError"));
      }
      finish({ reason: "detached", lastSeq: 0 });
    };

    const close = async () => {
      if (closePromise) return closePromise;
      if (stoppedByClient && completionSettled) return;
      stoppedByClient = true;
      clearReconnectTimer();
      const socket = activeSocket;
      activeSocket = null;
      socketOpenedSession = false;

      const closeAckTimeoutMs = Math.max(
        0,
        this.options.closeAckTimeoutMs ?? TERMINAL_CLOSE_ACK_TIMEOUT_MS,
      );

      closePromise = (async () => {
        let sentClose = false;
        if (socket && socket.readyState === 1) {
          try {
            socket.send(encodeFrame(TERMINAL_WS_OP.CLOSE));
            sentClose = true;
          } catch {
            // Ignore send failures while closing.
          }
        }

        if (socket && sentClose && socket.readyState === 1) {
          await new Promise<void>((resolveWait) => {
            let waitSettled = false;
            let timer: ReturnType<typeof setTimeout> | null = null;
            const done = (forceCloseSocket: boolean) => {
              if (waitSettled) return;
              waitSettled = true;
              if (timer !== null) {
                clearTimeout(timer);
                timer = null;
              }
              socket.onmessage = null;
              socket.onclose = null;
              socket.onerror = null;
              if (forceCloseSocket && (socket.readyState === 0 || socket.readyState === 1)) {
                try {
                  socket.close(1000, "closed");
                } catch {
                  // Ignore close errors.
                }
              }
              resolveWait();
            };

            const handleCloseMessage = (bytes: Uint8Array) => {
              if (waitSettled || bytes.byteLength === 0 || bytes[0] !== TERMINAL_WS_OP.EVENT) {
                return;
              }
              try {
                const parsed = JSON.parse(new TextDecoder().decode(bytes.subarray(1))) as Record<
                  string,
                  unknown
                >;
                const eventType = normalizeText(parsed.type);
                if (eventType === "terminal.exit" || eventType === "terminal.error") {
                  done(true);
                }
              } catch {
                // Ignore malformed frames while waiting for close acknowledgement.
              }
            };

            socket.onmessage = (event) => {
              if (waitSettled) return;
              if (event.data instanceof ArrayBuffer || ArrayBuffer.isView(event.data)) {
                const bytes =
                  event.data instanceof ArrayBuffer
                    ? new Uint8Array(event.data)
                    : new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
                handleCloseMessage(bytes);
                return;
              }
              void readBinaryData(event.data).then((bytes) => {
                if (bytes) {
                  handleCloseMessage(bytes);
                }
              });
            };
            socket.onclose = () => done(false);
            socket.onerror = () => done(true);
            timer = setTimeout(() => done(true), closeAckTimeoutMs);
          });
        } else if (socket && (socket.readyState === 0 || socket.readyState === 1)) {
          try {
            socket.close(1000, "closed");
          } catch {
            // Ignore close errors.
          }
        }

        if (!hasAccepted) {
          hasAccepted = true;
          rejectAccepted(
            new RealtimeTransportError(
              "terminal_identity_missing",
              "Terminal closed before terminal.opened",
            ),
          );
        }
        finish({ reason: "closed", lastSeq: 0 });
      })();

      return closePromise;
    };

    const stopImmediately = () => {
      void detach();
    };
    const lifecycleHandle = { stopImmediately };
    this.executions.add(lifecycleHandle);

    const handleExternalAbort = () => void detach();
    if (input.signal) {
      if (input.signal.aborted) {
        void detach();
      } else {
        input.signal.addEventListener("abort", handleExternalAbort, { once: true });
      }
    }

    if (this.disposed) {
      queueMicrotask(() => {
        fail(new RealtimeTransportError("transport_disposed", "Terminal transport has been disposed."));
      });
    } else if (!input.signal?.aborted) {
      void connect().catch((error) => {
        if (!hasAccepted) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      });
    }

    return {
      accepted,
      completion,
      getTerminalId: () => terminalId,
      write: async (data: string) => {
        if (!data) return;
        const socket = await waitForReadySocket();
        socket.send(encodeFrame(TERMINAL_WS_OP.INPUT, encoder.encode(data)));
      },
      resize: async (cols: number, rows: number) => {
        latestCols = Math.max(1, cols || 1);
        latestRows = Math.max(1, rows || 1);
        const socket = await waitForReadySocket();
        socket.send(encodeResizeFrame(latestCols, latestRows));
      },
      detach,
      close,
    };
  }

  subscribeStatus(listener: (event: AgentEvent) => void): () => void {
    if (this.disposed || !this.options.subscribeStatus) {
      return () => undefined;
    }
    return this.options.subscribeStatus(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const handle of Array.from(this.executions)) {
      handle.stopImmediately();
    }
    this.executions.clear();
    this.options.disposeStatus?.();
  }
}
