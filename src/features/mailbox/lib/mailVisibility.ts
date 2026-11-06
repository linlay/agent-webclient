import type { MailMetadata } from "@/shared/data/api/dto/mailbox";

/** User-origin messages have no MailMetadata; only interactive asks belong in chat. */
export function isBackgroundAgentMail(mail: Pick<MailMetadata, "kind"> | undefined): boolean {
  return Boolean(mail && mail.kind !== "ask");
}
