import React from "react";
import type { Agent } from "@/features/agents/lib/agentState";
import type { MailMetadata } from "@/shared/data/api/dto/mailbox";
import { useI18n } from "@/shared/i18n";
import { AgentIcon } from "@/shared/icons/agent";

/** Matches the inbound sender avatar so both mail lines read at one size. */
const AVATAR_SIZE = 30;
/** Avatar and name form one centered identity unit, never split by the wording. */
const SENDER_CLASS_NAME =
  "tw:inline-flex tw:align-middle tw:items-center tw:gap-1";

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
  const avatar = agent ? (
    <AgentIcon
      type="agent"
      icon={agent.icon}
      mode={agent.mode}
      interactive={false}
      props={{
        icon: {
          className: "tw:shrink-0",
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
        },
        avatar: { size: AVATAR_SIZE },
      }}
    />
  ) : null;
  const target =
    href ||
    (mail.fromChatId
      ? `/?${new URLSearchParams({ chatId: mail.fromChatId })}`
      : "");
  return (
    <span
      className="tw:text-xs tw:text-ink-muted"
      data-mail-kind={mail.kind}
      title={mail.id}
    >
      {target ? (
        <a
          className={SENDER_CLASS_NAME}
          href={target}
          onClick={onOpen}
        >
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
