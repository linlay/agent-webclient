import type { MailRecord } from "@/shared/data/api/dto/mailbox";
import { buildMailFormAwaiting, parseMailAskSnapshot } from "./mailAskSnapshot";
import { toWireAwaitingSubmit } from "@/features/tools/lib/protocol";

it("preserves the original form view and data while routing to the source Chat", () => {
  const snapshot = parseMailAskSnapshot(JSON.stringify({
    view: { source: "builtin", key: "platform_control_review" },
    form: { title: "Review operation", data: { operation: "inspect", command: "diskutil info disk0" } },
    fields: [{ name: "internal_call", type: "select", options: ["approve", "reject"] }],
  }))!;
  const mail = { mailId: "m", awaitingMode: "form", fromRunId: "child-run", fromChatId: "child-chat", fromAgentKey: "worker", awaitingId: "await" } as MailRecord;
  const awaiting = buildMailFormAwaiting(mail, snapshot)!;
  expect(awaiting).toMatchObject({ runId: "child-run", chatId: "child-chat", agentKey: "worker", view: snapshot.view,
    forms: [{ id: "await", title: "Review operation", form: snapshot.form!.data }],
  });
  expect(toWireAwaitingSubmit("form", [{ id: "await", decision: "approve", form: { decision: "approve" } }])).toEqual({ param: { decision: "approve", data: { decision: "approve" } } });
});

it("does not manufacture a view for a fields-only snapshot", () => {
  const snapshot = parseMailAskSnapshot('{"fields":[{"name":"call","type":"select"}]}')!;
  expect(buildMailFormAwaiting({ awaitingMode: "form", awaitingId: "a" } as MailRecord, snapshot)).toBeUndefined();
  expect(parseMailAskSnapshot("invalid")).toBeUndefined();
});
