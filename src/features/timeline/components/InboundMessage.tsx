import React from "react";
import type { Agent } from "@/features/agents/lib/agentState";
import type { RelatedChat, TimelineInbound, TimelineNode } from "../lib/timelineState";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import { useTimelineInteraction } from "./TimelineInteractionContext";
import styles from "./InboundMessage.module.css";

const SENDER_SLOT = "\u0000";
const KNOWN_OUTCOMES = new Set(["completed", "failed", "canceled"]);

/** A BOT sender opens its main Chat; any other Agent opens the sending Chat. */
function resolveSenderChat(agent: Agent | undefined, inbound: TimelineInbound): RelatedChat | undefined {
  if (agent?.primaryChat?.chatId) return { chatId: agent.primaryChat.chatId, agentKey: agent.key };
  return inbound.fromChatId ? { chatId: inbound.fromChatId, agentKey: inbound.fromAgentKey } : undefined;
}

/**
 * Input another Agent delivered: one muted line instead of a user bubble. A
 * child Chat's reply stays a bare marker; other mail opens its body on demand.
 */
export function InboundMessage({ node, agents, timeNode }: {
  node: TimelineNode & { inbound: TimelineInbound };
  agents: Agent[];
  timeNode?: React.ReactNode;
}): React.ReactElement {
  const { t } = useI18n();
  const interaction = useTimelineInteraction();
  const [expanded, setExpanded] = React.useState(false);
  const { inbound } = node;
  const body = String(node.text || "");
  const attachments = (node.attachments || []).filter((attachment) => String(attachment?.name || "").trim());
  const expandable = !inbound.child && (body.trim() !== "" || attachments.length > 0);

  let label: React.ReactNode = t(`timeline.inbound.child.${inbound.kind}`);
  if (!inbound.child) {
    const agent = agents.find((item) => item.key === inbound.fromAgentKey);
    const name = agent?.name || inbound.fromAgentKey;
    const chat = resolveSenderChat(agent, inbound);
    const href = chat && interaction?.openChat ? interaction.getChatHref?.(chat) : undefined;
    const sender = href && chat
      ? <a className={styles.sender} href={href} title={t("timeline.inbound.openSender", { agent: name })}
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            interaction?.openChat?.(chat);
          }}>{name}</a>
      : <span className={styles.sender}>{name}</span>;
    const [before, after = ""] = t(`timeline.inbound.${inbound.kind}`, { agent: SENDER_SLOT }).split(SENDER_SLOT);
    label = <>{before}{sender}{after}</>;
  }
  const outcome = inbound.outcome && KNOWN_OUTCOMES.has(inbound.outcome)
    ? t(`mailbox.outcome.${inbound.outcome}`)
    : "";

  return (
    <div className={styles.row} data-kind="message" data-role="user" data-inbound={inbound.kind}
      data-inbound-child={inbound.child || undefined} data-node-id={node.id} data-task-id={node.taskId || undefined}>
      <div className={styles.line}>
        <MaterialIcon name={inbound.kind === "reply" ? "reply" : "question_answer"} className={styles.icon} />
        <span className={styles.label}>{label}</span>
        {outcome && <span>· {outcome}</span>}
        {expandable && (
          <button type="button" className={styles.toggle} aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}>
            {expanded ? t("timeline.userBubble.collapse") : t("timeline.userBubble.expand")}
            <MaterialIcon name={expanded ? "keyboard_arrow_up" : "keyboard_arrow_down"} />
          </button>
        )}
        {timeNode}
      </div>
      {expandable && expanded && (
        <div className={styles.body}>
          {body.trim() && <div className={styles.text}>{body}</div>}
          {attachments.length > 0 && (
            <div className={styles.attachments}>
              {attachments.map((attachment, index) => (
                <React.Fragment key={`${attachment.name}_${index}`}>
                  {interaction?.renderAttachment?.(attachment, {}) ?? <span>{attachment.name}</span>}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
