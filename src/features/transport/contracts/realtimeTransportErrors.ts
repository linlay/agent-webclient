import type {
  AgentWebclientBridgeError,
  AgentWebclientBridgeErrorCode,
} from "@/shared/contracts/generated/agentWebclientBridge";

export type RealtimeTransportErrorCode =
  | AgentWebclientBridgeErrorCode
  | "desktop_bridge_missing"
  | "desktop_bridge_incompatible"
  | "transport_disposed"
  | "early_event_buffer_overflow"
  | "invalid_stream_event"
  | "time_contract_violation"
  | "unsupported_request_type"
  | "stream_unavailable"
  | "stream_interrupted"
  | "stream_frame_too_large"
  | "run_identity_missing"
  | "terminal_identity_missing"
  | "terminal_unsupported"
  | "protocol_version_mismatch"
  | "terminal_ws_handshake_failed"
  | "forbidden"
  | "terminal_not_found"
  | "conflict"
  | "too_many_requests"
  | "internal_error"
  | "unsupported";

export class RealtimeTransportError extends Error {
  readonly code: RealtimeTransportErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: RealtimeTransportErrorCode,
    message: string,
    options: { retryable?: boolean; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "RealtimeTransportError";
    this.code = code;
    this.retryable = options.retryable === true;
    this.details = options.details;
  }
}

export function fromDesktopBridgeError(
  error: AgentWebclientBridgeError,
): RealtimeTransportError {
  return new RealtimeTransportError(error.code, error.message, {
    retryable: error.retryable,
    details: error.details,
  });
}
