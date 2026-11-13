/**
 * Chat-level awaiting mode → i18n key.
 *
 * The Platform uses two vocabularies for the same state: the wire `awaiting.mode`
 * is "planning" (`AIAwaitWireMode`), while the client-side `ActiveAwaiting.mode`
 * is "plan". Both map to the plan label, so callers never need to normalise.
 */
const AWAITING_STATUS_LABEL_KEYS: Record<string, string> = {
  plan: "leftSidebar.awaitingStatus.plan",
  planning: "leftSidebar.awaitingStatus.plan",
  question: "leftSidebar.awaitingStatus.question",
  approval: "leftSidebar.awaitingStatus.approval",
  form: "leftSidebar.awaitingStatus.form",
};

/** Unknown or missing modes fall back to the generic "awaiting approval" copy. */
export function awaitingStatusLabelKey(mode?: string | null): string {
  const normalized = typeof mode === "string" ? mode.trim().toLowerCase() : "";
  return AWAITING_STATUS_LABEL_KEYS[normalized] || "leftSidebar.awaitingApproval";
}
