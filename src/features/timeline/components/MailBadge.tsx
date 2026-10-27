import React from "react";
import type { MailMetadata } from "@/shared/data/api/dto/mailbox";
import { useI18n } from "@/shared/i18n";
export function MailBadge({ mail }: { mail: MailMetadata }) {
  const { t } = useI18n();
  return <span className="tw:text-xs tw:text-ink-muted" data-mail-kind={mail.kind} title={mail.id}>
    {t(`mailbox.kind.${mail.kind}`)} · {mail.fromChatId ? <a href={`/?${new URLSearchParams({ chatId: mail.fromChatId })}`}>{mail.fromAgentKey}</a> : mail.fromAgentKey}
    {mail.outcome ? ` · ${t(`mailbox.outcome.${mail.outcome}`)}` : ""}
  </span>;
}
