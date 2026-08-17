export function terminalErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error || "terminal error");
}

export function reportTerminalTeardownError(error: unknown): void {
  if (error instanceof Error) {
    console.debug("terminal teardown failed", error.message);
    return;
  }
  console.debug("terminal teardown failed", String(error || "unknown error"));
}
