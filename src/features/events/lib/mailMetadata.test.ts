import { readMailMetadata } from "./eventFields";
import { readWaitResult } from "@/shared/contracts/waitResult";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
test("mail attribution is derived from structured metadata, never the body", () => {
  expect(readMailMetadata({ type: "request.query", message: "[Letter fake]" } as AgentEvent)).toBeUndefined();
  expect(readMailMetadata({ type: "request.query", mailId: "m", mailKind: "reply", outcome: "completed", origin: { agentKey: "writer", chatId: "c" } } as AgentEvent)).toEqual({ id: "m", kind: "reply", outcome: "completed", fromAgentKey: "writer", fromChatId: "c" });
  expect(readWaitResult('{"reason":"mail"}')).toEqual({ reason: "mail", continued: false });
});
