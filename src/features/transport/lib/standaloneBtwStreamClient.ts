import {
  createPlatformApiError,
  createRequestId,
  getErrorMessageFromText,
  requestWithAuth,
} from "@/shared/data/api/http";
import type { ApiResponse } from "@/shared/data/api/client";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import { RealtimeTransportError } from "@/features/transport/contracts/realtimeTransportErrors";
import { decodePlatformAgentEvent } from "@/features/transport/lib/platformFrameCodec";
import type {
  PlatformFrameClient,
  PlatformRequestOptions,
  PlatformStreamOptions,
} from "@/features/transport/lib/platformFrameClient";
import { ensureStandaloneWsClient } from "@/features/transport/lib/standaloneWsClient";

// Match the existing WS default frame scale; bound retained decoded text, including unfinished lines.
export const STANDALONE_BTW_SSE_BUFFER_LIMIT = 1 << 20;

/** Standalone BTW starts over HTTP; ordinary Run observation and control keep the shared WS client. */
export class StandaloneBtwStreamClient implements Pick<PlatformFrameClient, "stream" | "request"> {
  private readonly closeStreams = new Set<() => void>();
  private disposed = false;

  constructor(
    private readonly ensureControlClient: () => Promise<Pick<PlatformFrameClient, "request">> = ensureStandaloneWsClient,
  ) {}

  async request<T>(options: PlatformRequestOptions): Promise<ApiResponse<T>> {
    if (this.disposed) throw new DOMException("The BTW transport was disposed.", "AbortError");
    return (await this.ensureControlClient()).request<T>(options);
  }

  stream(options: PlatformStreamOptions): { requestId: string; abort: () => void } {
    const requestId = options.requestId || createRequestId("sse");
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let stopped = false;
    let lastSeq = 0;
    let buffer = "";
    let dataLines: string[] = [];
    let dataCharacters = 0;
    let terminalEventSeen = false;

    const abort = () => {
      if (stopped) return;
      stopped = true;
      this.closeStreams.delete(close);
      options.signal?.removeEventListener("abort", close);
      controller.abort();
      void reader?.cancel().catch(() => undefined);
    };
    const close = () => {
      if (stopped) return;
      abort();
      options.onDone?.("detached", lastSeq);
    };
    const finish = () => {
      if (stopped) return;
      abort();
      options.onDone?.("done", lastSeq);
    };
    const fail = (cause: unknown) => {
      if (stopped) return;
      abort();
      options.onError?.(cause instanceof Error ? cause : new Error(String(cause || "BTW stream failed")));
    };
    const dispatchData = () => {
      const raw = dataLines.join("\n");
      dataLines = [];
      dataCharacters = 0;
      if (!raw.trim() || stopped) return;
      if (raw.trim() === "[DONE]") { finish(); return; }
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new RealtimeTransportError("invalid_stream_event", "BTW SSE event contains invalid JSON");
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new RealtimeTransportError("invalid_stream_event", "BTW SSE event must be an object");
      }
      const event = decodePlatformAgentEvent(value as Record<string, unknown>);
      if (!event) {
        throw new RealtimeTransportError("time_contract_violation", "Stream event requires epoch_ms_int64 timestamp");
      }
      if (!event.type.trim()) {
        throw new RealtimeTransportError("invalid_stream_event", "BTW SSE event requires a type");
      }
      lastSeq = Math.max(lastSeq, Number(event.seq) || 0);
      if (event.type === "run.complete" || event.type === "run.cancel") terminalEventSeen = true;
      options.onFrame?.(raw);
      options.onEvent(event);
      if (!stopped && event.type === "run.error") {
        fail(createPlatformApiError(event, { fallbackMessage: "BTW Run failed" }));
      }
    };
    const acceptLine = (line: string) => {
      if (line.length + dataCharacters > STANDALONE_BTW_SSE_BUFFER_LIMIT) {
        throw new RealtimeTransportError("stream_frame_too_large", "BTW SSE event exceeds the buffer limit");
      }
      if (!line) { dispatchData(); return; }
      if (line.startsWith(":")) return;
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /u, "");
      if (field === "data") {
        dataCharacters += value.length + 1;
        if (dataCharacters > STANDALONE_BTW_SSE_BUFFER_LIMIT) {
          throw new RealtimeTransportError("stream_frame_too_large", "BTW SSE event exceeds the buffer limit");
        }
        dataLines.push(value);
      }
    };
    const consumeText = (text: string, eof = false) => {
      buffer += text;
      let lineStart = 0;
      for (let index = 0; index < buffer.length && !stopped; index += 1) {
        const character = buffer[index];
        if (character !== "\r" && character !== "\n") continue;
        // A CRLF pair can be split across network chunks.
        if (character === "\r" && index === buffer.length - 1 && !eof) break;
        acceptLine(buffer.slice(lineStart, index));
        if (character === "\r" && buffer[index + 1] === "\n") index += 1;
        lineStart = index + 1;
      }
      buffer = buffer.slice(lineStart);
      if (!stopped && buffer.length + dataCharacters > STANDALONE_BTW_SSE_BUFFER_LIMIT) {
        throw new RealtimeTransportError("stream_frame_too_large", "BTW SSE event exceeds the buffer limit");
      }
      if (eof && !stopped) {
        if (buffer) acceptLine(buffer);
        buffer = "";
        dispatchData();
      }
    };

    this.closeStreams.add(close);
    if (this.disposed || options.signal?.aborted) {
      close();
      return { requestId, abort };
    }
    options.signal?.addEventListener("abort", close, { once: true });

    void (async () => {
      try {
        if (options.type !== dataEndpoints.btw.path) {
          throw new RealtimeTransportError("unsupported_request_type", "The BTW SSE client only supports /api/btw");
        }
        if (!options.payload || typeof options.payload !== "object" || Array.isArray(options.payload)) {
          throw new RealtimeTransportError("invalid_request", "BTW request payload must be an object");
        }
        const response = await requestWithAuth(dataEndpoints.btw.path, {
          method: "POST",
          headers: { Accept: "text/event-stream" },
          body: JSON.stringify({ ...options.payload, stream: true }),
          signal: controller.signal,
          retryUnauthorized: false,
          authFailureSource: "sse",
        });
        if (stopped) {
          await response.body?.cancel().catch(() => undefined);
          return;
        }
        const contentType = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
        if (!response.ok || contentType !== "text/event-stream") {
          const fallbackMessage = response.ok ? "Expected a BTW SSE response" : `HTTP ${response.status}`;
          const details = getErrorMessageFromText(await response.text(), fallbackMessage, response.status);
          throw createPlatformApiError(details.platformError || { message: details.message, code: details.code }, {
            status: response.status, code: details.code, data: details.data, fallbackMessage,
          });
        }
        if (!response.body) {
          throw new RealtimeTransportError("stream_unavailable", "BTW SSE response body is unavailable");
        }
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (!stopped) {
          const { done, value } = await reader.read();
          if (stopped) break;
          if (done) {
            consumeText(decoder.decode(), true);
            if (!stopped) {
              if (terminalEventSeen) finish();
              else fail(new RealtimeTransportError(
                "stream_interrupted", "BTW stream ended before a terminal event", { retryable: true },
              ));
            }
            break;
          }
          consumeText(decoder.decode(value, { stream: true }));
        }
      } catch (cause) {
        fail(cause);
      } finally {
        try { reader?.releaseLock(); } catch { /* Cancellation may already have released the stream. */ }
      }
    })();
    return { requestId, abort };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const close of Array.from(this.closeStreams)) close();
  }
}
