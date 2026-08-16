export type RealtimeTransportErrorCode =
  | "desktop_bridge_missing"
  | "desktop_bridge_incompatible"
  | "transport_disposed"
  | "early_event_buffer_overflow"
  | "run_identity_missing"
  | "terminal_identity_missing";

export class RealtimeTransportError extends Error {
  readonly code: RealtimeTransportErrorCode;

  constructor(code: RealtimeTransportErrorCode, message: string) {
    super(message);
    this.name = "RealtimeTransportError";
    this.code = code;
  }
}
