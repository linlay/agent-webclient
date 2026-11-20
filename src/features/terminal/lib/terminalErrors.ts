import { RealtimeTransportError } from "@/features/transport/contracts/realtimeTransportErrors";

export function terminalErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error || "terminal error");
}

export function terminalErrorDisplayMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (error instanceof RealtimeTransportError) {
    if (error.code === "protocol_version_mismatch") {
      return t("terminal.error.versionMismatch");
    }
    if (error.code === "terminal_ws_handshake_failed") {
      return t("terminal.error.handshakeFailed");
    }
  }
  return terminalErrorMessage(error);
}

export function reportTerminalTeardownError(error: unknown): void {
  if (error instanceof Error) {
    console.debug("terminal teardown failed", error.message);
    return;
  }
  console.debug("terminal teardown failed", String(error || "unknown error"));
}
