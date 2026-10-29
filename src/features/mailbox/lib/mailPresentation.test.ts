import { canActOnMail, mailEvidenceKey } from "./mailPresentation";
import type { MailRecord } from "@/shared/data/api/dto/mailbox";
const base = { kind: "letter", status: "suspended" } as MailRecord;
test("only recoverable letters and replies expose actions", () => {
  expect(canActOnMail(base)).toBe(true);
  expect(canActOnMail({ ...base, kind: "reply" })).toBe(true);
  for (const kind of ["ask", "notify"] as const) expect(canActOnMail({ ...base, kind })).toBe(false);
  expect(canActOnMail({ ...base, status: "delivered" })).toBe(false);
  expect(canActOnMail({ ...base, purgedAt: 1 })).toBe(false);
});
test("missing or unexpected evidence is presented as uncertain", () => {
  expect(mailEvidenceKey(base)).toBe("mailbox.evidence.unknown");
  expect(mailEvidenceKey({ ...base, evidence: "consumed" })).toBe("mailbox.evidence.consumed");
  expect(mailEvidenceKey({ ...base, evidence: "none" })).toBe("mailbox.evidence.none");
});
