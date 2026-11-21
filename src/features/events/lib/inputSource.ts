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

function inputOriginType(event: AgentEvent): string {
  return toText(readOrigin(event)?.type) || (event.role === "automation" ? "automation" : "");
}

export function isDeliveredInput(event: AgentEvent): boolean {
  const type = inputOriginType(event);
  return type !== "" && type !== "user";
}

/**
 * Classifies an input by sender. receiverAgentKey names the Agent of the
 * receiving Run when the event itself omits it, as request.steer does.
 */
export function classifyInput(event: AgentEvent, receiverAgentKey = ""): InputDisplay {
  const origin = readOrigin(event);
  if (inputOriginType(event) === "automation") {
    return { kind: "inbound", inbound: {
      kind: "letter", child: false, automation: { name: toText(origin?.automationName) },
    } };
  }
  const mail = readMailMetadata(event);
  if (mail?.kind === "ask") return { kind: "ask", mail };
  if (!isDeliveredInput(event)) return { kind: "message" };
  const fromAgentKey = toText(origin?.agentKey);
  const receiver = toText(event.agentKey) || receiverAgentKey;
  const kind = mail?.kind ?? "letter";
  // Letters always have a visible sender row. Replies and notifications stay
  // internal when the sender matches the receiver or either identity is missing.
  const child = kind !== "letter" && (!fromAgentKey || !receiver || fromAgentKey === receiver);
  return {
    kind: "inbound",
    inbound: {
      kind,
      fromAgentKey,
      ...(toText(origin?.chatId) ? { fromChatId: toText(origin?.chatId) } : {}),
      ...(mail?.outcome ? { outcome: mail.outcome } : {}),
      child,
    },
  };
}
