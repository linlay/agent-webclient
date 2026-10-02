export type WaitReason = "elapsed" | "event" | "timeout" | "steered" | "canceled" | "failed";
const WAIT_REASONS = new Set<string>(["elapsed", "event", "timeout", "steered", "canceled", "failed"]);

/** Reads how a wait ended; `continued` marks a steer that carried no new input. */
export function readWaitResult(resultText: string | undefined): { reason: WaitReason | null; continued: boolean } {
  if (!resultText) return { reason: null, continued: false };
  try {
    const result = JSON.parse(resultText);
    const reason = typeof result?.reason === "string" && WAIT_REASONS.has(result.reason) ? result.reason as WaitReason : null;
    return { reason, continued: reason === "steered" && result?.continued === true };
  } catch {
    return { reason: null, continued: false };
  }
}

export function readWaitDescription(argsText: string | undefined): string {
  if (!argsText) return "";
  try {
    const description = JSON.parse(argsText)?.description;
    return typeof description === "string" ? description.trim() : "";
  } catch {
    return ""; // Arguments can still be streaming.
  }
}
