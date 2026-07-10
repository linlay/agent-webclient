export type DetachRunReason =
  | "chat_switch"
  | "new_conversation"
  | "page_leave"
  | "transport_cleanup"
  | "attach_switch";

export interface DetachRunEventDetail {
  chatId?: string;
  runId: string;
  agentKey?: string;
  reason?: DetachRunReason;
}

export const AGENT_DETACH_RUN_EVENT = "agent:detach-run";

export function dispatchDetachRunEvent(detail: DetachRunEventDetail): void {
  const runId = String(detail.runId || "").trim();
  if (
    !runId
    || typeof window === "undefined"
    || typeof window.dispatchEvent !== "function"
    || typeof CustomEvent !== "function"
  ) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(AGENT_DETACH_RUN_EVENT, {
      detail: {
        ...detail,
        runId,
        chatId: String(detail.chatId || "").trim(),
        agentKey: String(detail.agentKey || "").trim(),
        reason: detail.reason,
      },
    }),
  );
}
