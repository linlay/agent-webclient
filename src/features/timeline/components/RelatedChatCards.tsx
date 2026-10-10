import React from "react";
import type { Agent } from "@/features/agents/lib/agentState";
import type { TimelineNode, RelatedChat } from "../lib/timelineState";
import { useI18n } from "@/shared/i18n";
import { useTimelineInteraction } from "./TimelineInteractionContext";
import styles from "./RelatedChatCards.module.css";

export function RelatedChatCards({ nodes, agents }: { nodes: TimelineNode[]; agents: Agent[] }): React.ReactElement | null {
  const { t } = useI18n();
  const interaction = useTimelineInteraction();
  const chats = new Map<string, RelatedChat>();
  for (const node of nodes) {
    const chat = node.relatedChat;
    if (chat && chat.chatId !== interaction?.surfaceContext?.chatId) {
      chats.set(chat.chatId, { ...chats.get(chat.chatId), ...chat, title: chat.title || chats.get(chat.chatId)?.title });
    }
  }
  if (!chats.size) return null;
  return <div className={styles.cards}>
    {[...chats.values()].map(chat => {
      const owner = agents.find(agent => agent.key === chat.agentKey)?.name || chat.agentKey;
      return <a key={chat.chatId} className={styles.card}
        title={[chat.title || t("timeline.relatedChat.untitled"), owner].filter(Boolean).join(" · ")}
        href={`/?${new URLSearchParams({ chatId: chat.chatId })}`}
        onClick={event => {
          if (!interaction?.openChat || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          interaction.openChat(chat);
        }}>
        <span className={styles.copy}>
          <span className={styles.title}>{chat.title || t("timeline.relatedChat.untitled")}</span>
        </span>
        <span className={styles.action}>{t("timeline.relatedChat.open")} <span aria-hidden="true">↗</span></span>
      </a>;
    })}
  </div>;
}
