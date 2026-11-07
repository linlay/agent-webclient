import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type { MailMetadata } from "@/shared/data/api/dto/mailbox";
import type { TimelineInbound } from "@/features/timeline/lib/timelineState";
import { readMailMetadata } from "@/features/events/lib/eventFields";
import { toText } from "@/shared/utils/eventUtils";

/** How a request.query or request.steer input appears in the timeline. */
export type InputDisplay =
  | { kind: "message" }
  | { kind: "ask"; mail: MailMetadata }
  | { kind: "inbound"; inbound: TimelineInbound };

function readOrigin(event: AgentEvent): Record<string, unknown> | undefined {
  const origin = event.origin;
  return origin && typeof origin === "object" ? origin as Record<string, unknown> : undefined;
}

/**
 * The Platform writes origin itself and marks every input the user did not
 * send; a user's own steer carries none. Automation keeps its hidden rules.
 */
export function isAgentInput(event: AgentEvent): boolean {
  const type = toText(readOrigin(event)?.type);
  return type !== "" && type !== "user" && type !== "automation";
}

/**
 * Classifies an input by sender. receiverAgentKey names the Agent of the
 * receiving Run when the event itself omits it, as request.steer does.
 */
export function classifyInput(event: AgentEvent, receiverAgentKey = ""): InputDisplay {
  const mail = readMailMetadata(event);
  if (mail?.kind === "ask") return { kind: "ask", mail };
  if (!isAgentInput(event)) return { kind: "message" };
  const origin = readOrigin(event);
  const fromAgentKey = toText(origin?.agentKey);
  const receiver = toText(event.agentKey) || receiverAgentKey;
  // A BOT dispatches only to its own child Chats, so a same-Agent sender is
  // the parent or a child. An unknown side counts as own: never leak a body.
  const own = !fromAgentKey || !receiver || fromAgentKey === receiver;
  const kind = mail?.kind ?? "letter";
  // The parent's task is the child Chat's whole input.
  if (own && kind === "letter") return { kind: "message" };
  return {
    kind: "inbound",
    inbound: {
      kind,
      fromAgentKey,
      ...(toText(origin?.chatId) ? { fromChatId: toText(origin?.chatId) } : {}),
      ...(mail?.outcome ? { outcome: mail.outcome } : {}),
      child: own,
    },
  };
}
