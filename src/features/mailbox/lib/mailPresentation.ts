import type { MailRecord } from "@/shared/data/api/dto/mailbox";
export function canActOnMail(mail: MailRecord): boolean {
  return mail.status === "suspended" && (mail.kind === "letter" || mail.kind === "reply") && !mail.purgedAt;
}
export function mailEvidenceKey(mail: MailRecord): string {
  return `mailbox.evidence.${mail.evidence === "none" || mail.evidence === "consumed" ? mail.evidence : "unknown"}`;
}
export function mailBody(mail: MailRecord): string {
  if (mail.kind !== "ask") return mail.message;
  try { return JSON.stringify(JSON.parse(mail.message), null, 2); } catch { return mail.message; }
}
