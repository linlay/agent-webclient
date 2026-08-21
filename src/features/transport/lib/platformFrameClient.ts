import type { AgentEvent } from "@/app/state/types";
import type {
  AgentPlatformErrorFrame,
  AgentPlatformPushFrame,
  AgentPlatformRequestFrame,
  AgentPlatformResponseFrame,
  AgentPlatformStreamFrame,
} from "@/features/transport/contracts/generated/agentWebclientBridge";
import type {
  PushFrame,
  RealtimeConnectionStatus,
} from "@/features/transport/contracts/realtimeTransport";
import {
  decodePlatformAgentEvent,
  decodePlatformApiError,
  decodePlatformApiResponse,
} from "@/features/transport/lib/platformFrameCodec";
import type { ApiResponse } from "@/shared/data/api/client";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import { createCompactId } from "@/shared/utils/compactId";

export type PlatformRequestOptions = {
  type: string;
  payload?: unknown;
  signal?: AbortSignal;
};

export type PlatformStreamOptions = {
  type: string;
  payload: unknown;
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
  onFrame?: (raw: string) => void;
  onError?: (error: Error) => void;
  onDone?: (reason: string, lastSeq: number) => void;
  requestId?: string;
};

export type PlatformTransportErrorHandler = (
  error: Error,
  context: { id?: string; kind: "request" | "stream" },
) => void;

type PendingRequest = {
  resolve(value: ApiResponse): void;
  reject(error: unknown): void;
  timer: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abortHandler?: () => void;
};

type ActiveStream = {
  options: PlatformStreamOptions;
  abortHandler?: () => void;
};

type PlatformInboundFrame =
  | AgentPlatformResponseFrame
  | AgentPlatformStreamFrame
  | AgentPlatformPushFrame
  | AgentPlatformErrorFrame;

export function createPlatformFrameId(kind: "request" | "stream", nowMs = Date.now()): string {
	return createCompactId(kind === "request" ? "pfr" : "pfs", {
		nowMs,
		overflowMessage: "Platform frame id overflow in the same second",
	});
}

export class PlatformRequestTimeoutError extends Error {
  readonly code = "PLATFORM_REQUEST_TIMEOUT";

  constructor(message = "Platform request timeout") {
    super(message);
    this.name = "PlatformRequestTimeoutError";
  }
}

/**
 * Shared, network-agnostic Platform frame state machine. Concrete drivers own
 * connection liveness and only provide connect/status/send primitives.
 */
export abstract class PlatformFrameClient {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly streams = new Map<string, ActiveStream>();
  private readonly pushListeners = new Set<(frame: PushFrame) => void>();
  private pushHandler?: (frame: PushFrame) => void;
  private transportErrorHandler?: PlatformTransportErrorHandler;

  protected constructor(
    private readonly requestTimeoutMs = 30_000,
    transportErrorHandler?: PlatformTransportErrorHandler,
  ) {
    this.transportErrorHandler = transportErrorHandler;
  }

	abstract connect(signal?: AbortSignal): Promise<void>;
  abstract getStatus(): RealtimeConnectionStatus;
  protected abstract sendRequestFrame(frame: AgentPlatformRequestFrame): void;

  setPushHandler(handler?: (frame: PushFrame) => void): void {
    this.pushHandler = handler;
  }

  setTransportErrorHandler(handler?: PlatformTransportErrorHandler): void {
    this.transportErrorHandler = handler;
  }

  subscribePush(listener: (frame: PushFrame) => void): () => void {
    this.pushListeners.add(listener);
    return () => this.pushListeners.delete(listener);
  }

  async request<T>(options: PlatformRequestOptions): Promise<ApiResponse<T>> {
		await this.connect(options.signal);
    const id = createPlatformFrameId("request");
    return new Promise<ApiResponse<T>>((resolve, reject) => {
      const cleanup = () => this.cleanupPendingRequest(id);
      const abortHandler = () => {
        cleanup();
        reject(new DOMException("The operation was aborted.", "AbortError"));
      };
      if (options.signal?.aborted) {
        abortHandler();
        return;
      }
      options.signal?.addEventListener("abort", abortHandler, { once: true });
      const timer = setTimeout(() => {
        cleanup();
        reject(new PlatformRequestTimeoutError(`Platform request timeout: ${options.type}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          cleanup();
          resolve(value as ApiResponse<T>);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
        timer,
        signal: options.signal,
        abortHandler,
      });
      try {
        this.sendRequestFrame({
          frame: "request",
          type: options.type,
          id,
          ...(options.payload === undefined ? {} : { payload: options.payload }),
        });
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  stream(options: PlatformStreamOptions): { requestId: string; abort: () => void } {
    const id = options.requestId || createPlatformFrameId("stream");
    let aborted = false;
    const abort = () => {
      if (aborted) return;
      aborted = true;
      this.cleanupStream(id);
    };
    const abortHandler = () => {
      abort();
      options.onError?.(new DOMException("The operation was aborted.", "AbortError"));
    };
    if (options.signal?.aborted) {
      abortHandler();
      return { requestId: id, abort };
    }
    options.signal?.addEventListener("abort", abortHandler, { once: true });
    this.streams.set(id, { options, abortHandler });
		void this.connect(options.signal)
      .then(() => {
        if (aborted || !this.streams.has(id)) return;
        this.sendRequestFrame({
          frame: "request",
          type: options.type,
          id,
          payload: options.payload,
        });
      })
      .catch((error) => {
        this.cleanupStream(id);
        options.onError?.(error instanceof Error ? error : new Error(String(error)));
      });
    return { requestId: id, abort };
  }

  attachRun(
    runId: string,
    agentKey: string,
    lastSeq: number,
    onEvent: (event: AgentEvent) => void,
    onDone?: (reason: string, lastSeq: number) => void,
    signal?: AbortSignal,
  ): { requestId: string; abort: () => void } {
    const requestId = createPlatformFrameId("stream");
    const stream = this.stream({
      type: dataEndpoints.attach.path,
      payload: { runId, agentKey, lastSeq },
      signal,
      onEvent,
      onDone,
      onError: (error) => onDone?.(error.name === "AbortError" ? "detached" : "error", 0),
      requestId,
    });
    return { requestId, abort: stream.abort };
  }

  protected dispatchPlatformFrame(frame: PlatformInboundFrame, raw = JSON.stringify(frame)): void {
    if (frame.frame === "response") {
      const pending = frame.id ? this.pending.get(frame.id) : null;
      if (!pending) return;
      try {
        pending.resolve(decodePlatformApiResponse(frame));
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        this.transportErrorHandler?.(normalized, { id: frame.id, kind: "request" });
        pending.reject(normalized);
      }
      return;
    }
    if (frame.frame === "stream") {
      const stream = frame.id ? this.streams.get(frame.id) : null;
      if (!stream || !frame.id) return;
      stream.options.onFrame?.(raw);
      if (frame.event) {
        const event = decodePlatformAgentEvent(frame.event);
        if (!event) {
          stream.options.onError?.(new Error(
            "time_contract_violation: stream event requires epoch_ms_int64 timestamp",
          ));
          this.cleanupStream(frame.id);
          return;
        }
        stream.options.onEvent(event);
      }
      if (frame.reason) {
        stream.options.onDone?.(frame.reason, typeof frame.lastSeq === "number" ? frame.lastSeq : 0);
        this.cleanupStream(frame.id);
      }
      return;
    }
    if (frame.frame === "push") {
      const type = String(frame.type || "").trim();
      if (type === "connected" || type === "heartbeat" || type === "live.connected") return;
      this.pushHandler?.(frame as PushFrame);
      for (const listener of this.pushListeners) listener(frame as PushFrame);
      return;
    }
    const error = decodePlatformApiError(frame);
    if (!frame.id) return;
    const pending = this.pending.get(frame.id);
    if (pending) {
      this.transportErrorHandler?.(error, { id: frame.id, kind: "request" });
      pending.reject(error);
      return;
    }
    const stream = this.streams.get(frame.id);
    if (stream) {
      this.transportErrorHandler?.(error, { id: frame.id, kind: "stream" });
      stream.options.onError?.(error);
      this.cleanupStream(frame.id);
    }
  }

  protected failPlatformFrames(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    for (const [id, stream] of this.streams) {
      stream.options.onError?.(error);
      this.cleanupStream(id);
    }
  }

  protected disposePlatformFrames(error: Error): void {
    this.failPlatformFrames(error);
    this.pushListeners.clear();
    this.pushHandler = undefined;
  }

  private cleanupPendingRequest(id: string): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    if (pending.signal && pending.abortHandler) {
      pending.signal.removeEventListener("abort", pending.abortHandler);
    }
    this.pending.delete(id);
  }

  private cleanupStream(id: string): void {
    const stream = this.streams.get(id);
    if (!stream) return;
    if (stream.options.signal && stream.abortHandler) {
      stream.options.signal.removeEventListener("abort", stream.abortHandler);
    }
    this.streams.delete(id);
  }
}
