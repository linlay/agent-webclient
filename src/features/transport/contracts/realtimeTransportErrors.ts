import type {
  AgentWebclientBridgeError,
  AgentWebclientBridgeErrorCode,
} from "@/features/transport/contracts/generated/agentWebclientBridge";

export type RealtimeTransportErrorCode =
  | AgentWebclientBridgeErrorCode
  | "desktop_bridge_missing"
  | "desktop_bridge_incompatible"
  | "transport_disposed"
  | "early_event_buffer_overflow"
  | "run_identity_missing"
  | "terminal_identity_missing"
  | "terminal_unsupported";

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
