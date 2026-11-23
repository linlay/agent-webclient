import React from "react";
import type { Agent } from "@/features/agents/lib/agentState";
import type {
  RelatedChat,
  TimelineInbound,
  TimelineNode,
} from "../lib/timelineState";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import { MailSenderAvatar } from "./MailSenderAvatar";
import { useTimelineInteraction } from "./TimelineInteractionContext";
import { notifyLocalLayoutToggle } from "@/shared/utils/localLayoutToggle";
import styles from "./InboundMessage.module.css";

const SENDER_SLOT = "\u0000";

/** A BOT sender opens its main Chat; any other Agent opens the sending Chat. */
function resolveSenderChat(
  agent: Agent | undefined,
  inbound: TimelineInbound,
): RelatedChat | undefined {
  if (agent?.primaryChat?.chatId)
    return { chatId: agent.primaryChat.chatId, agentKey: agent.key };
  return inbound.fromChatId
    ? { chatId: inbound.fromChatId, agentKey: inbound.fromAgentKey }
    : undefined;
}

/**
 * Agent and automation letters open their body on demand.
 */
export function InboundMessage({
  node,
  agents,
  timeNode,
}: {
  node: TimelineNode & { inbound: TimelineInbound };
  agents: Agent[];
  timeNode?: React.ReactNode;
}): React.ReactElement | null {
  const { t } = useI18n();
  const interaction = useTimelineInteraction();
  const [expanded, setExpanded] = React.useState(false);
  const { inbound } = node;
  // Same-Agent child replies are internal delivery, not reader-facing messages.
  if (inbound.child) return null;
  const body = String(node.text || "");
  const attachments = (node.attachments || []).filter((attachment) =>
    String(attachment?.name || "").trim(),
  );
  const expandable =
    !inbound.child && (body.trim() !== "" || attachments.length > 0);

  const agent = agents.find((item) => item.key === inbound.fromAgentKey);
  const name = inbound.automation
    ? inbound.automation.name || t("timeline.inbound.automation")
    : agent?.name || inbound.fromAgentKey || t("timeline.inbound.unknownSender");
  const chat = resolveSenderChat(agent, inbound);
  const href =
    chat && interaction?.openChat ? interaction.getChatHref?.(chat) : undefined;
  // Avatar only when the sender is in the Agent directory; it sits with the name so the
  // link target and the identity read as one unit.
  const avatar = agent ? <MailSenderAvatar agent={agent} className={styles.avatar} /> : null;
  const sender =
    href && chat ? (
      <a
        className={styles.sender}
        href={href}
        title={t("timeline.inbound.openSender", { agent: name })}
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          interaction?.openChat?.(chat);
        }}
      >
        {avatar}
        {name}
      </a>
    ) : (
      <span className={styles.sender}>
        {avatar}
        {name}
      </span>
    );
  const [before, after = ""] = t(`timeline.inbound.${inbound.kind}`, {
    agent: SENDER_SLOT,
  }).split(SENDER_SLOT);
  const label = (
    <>
      {before}
      {sender}
      {after}
    </>
  );

  return (
    <div
      className={styles.row}
      data-kind="message"
      data-role="user"
      data-inbound={inbound.kind}
      data-inbound-child={inbound.child || undefined}
      data-node-id={node.id}
      data-task-id={node.taskId || undefined}
    >
      <div
        className={styles.line}
        data-expandable={expandable || undefined}
        onClick={
          expandable
            ? (event) => {
                // Primary button only; nested controls own their clicks, and a text
                // selection drag is not a click either.
                if (event.button !== 0) return;
                if ((event.target as HTMLElement).closest?.("a, button"))
                  return;
                const selection = window.getSelection?.();
                if (selection && !selection.isCollapsed) return;
                notifyLocalLayoutToggle();
                setExpanded((value) => !value);
              }
            : undefined
        }
      >
        {timeNode && <div className={styles.time}>{timeNode}</div>}
        <span className={styles.center}>
          <span className={styles.label}>{label}</span>
          {expandable && (
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? t("timeline.userBubble.collapse")
                  : t("timeline.userBubble.expand")
              }
              onClick={() => {
                notifyLocalLayoutToggle();
                setExpanded((value) => !value);
              }}
            >
              <MaterialIcon
                name="keyboard_arrow_down"
                aria-hidden="true"
                style={{
                  transform: expanded ? "rotate(180deg)" : "",
                  transition: "transform 0.2s",
                }}
              />
            </button>
          )}
        </span>
      </div>
      {expandable && expanded && (
        <div className={styles.body}>
          {body.trim() && <div className={styles.text}>{body}</div>}
          {attachments.length > 0 && (
            <div className={styles.attachments}>
              {attachments.map((attachment, index) => (
                <React.Fragment key={`${attachment.name}_${index}`}>
                  {interaction?.renderAttachment?.(attachment, {}) ?? (
                    <span>{attachment.name}</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
