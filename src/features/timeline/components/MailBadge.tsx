import React from "react";
import type { Agent } from "@/features/agents/lib/agentState";
import type { MailMetadata } from "@/shared/data/api/dto/mailbox";
import { useI18n } from "@/shared/i18n";
import { MailSenderAvatar } from "./MailSenderAvatar";

const SENDER_CLASS_NAME = "tw:inline-flex tw:items-baseline tw:gap-1";

/**
 * One muted line naming a mail input: sender · kind · outcome — who sent it, what
 * kind of mail it is, then how it ended. The sender stays leftmost so the avatar
 * and name act as the subject instead of sitting inside the wording.
 *
 * Callers that own a resolved Chat target (a hint on which Chat to open and how)
 * pass `href`/`onOpen` so the sender link shares their in-app navigation; the
 * timeline-only fallback keeps the plain `/?chatId=` target. The sender avatar
 * needs the Agent directory; without a matching Agent the line stays text-only.
 */
export function MailBadge({
  mail,
  href,
  onOpen,
  agents,
}: {
  mail: MailMetadata;
  href?: string;
  onOpen?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  agents?: readonly Agent[];
}) {
  const { t } = useI18n();
  const name = mail.fromAgentName || mail.fromAgentKey;
  const agent = agents?.find((item) => item.key === mail.fromAgentKey);
  const avatar = agent ? <MailSenderAvatar agent={agent} /> : null;
  const target =
    href ||
    (mail.fromChatId
      ? `/?${new URLSearchParams({ chatId: mail.fromChatId })}`
      : "");
  return (
    <span className="tw:text-xs tw:text-ink-muted" data-mail-kind={mail.kind}>
      {target ? (
        <a className={SENDER_CLASS_NAME} href={target} onClick={onOpen}>
          {avatar}
          {name}
        </a>
      ) : (
        <span className={SENDER_CLASS_NAME}>
          {avatar}
          {name}
        </span>
      )}
      {" · "}
      {t(`mailbox.kind.${mail.kind}`)}
      {mail.outcome ? ` · ${t(`mailbox.outcome.${mail.outcome}`)}` : ""}
    </span>
  );
}
