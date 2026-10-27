import React, { useMemo } from "react";
import { useAppContext } from "@/app/state/AppContext";
import { AgentIcon } from "@/shared/icons/agent";
import { effectiveAgentIcon } from "@/shared/icons/agentAppearance";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import { isChatActiveRun } from "@/features/chats/lib/chatRunState";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
import { selectPrimaryNavigation } from "../lib/primaryNavigation";
import styles from "./PrimaryChatNavigation.module.css";

export function PrimaryChatNavigation(props: {
  collapsed?: boolean;
  onSelectChat: (chatId: string) => void;
  onStartPrimary: (workerKey: string) => void;
  onOpenHistory: (agentKey?: string) => void;
  getChatLoading: (chatId: string) => boolean;
}) {
  const { state } = useAppContext();
  const { t } = useI18n();
  const rows = useMemo(() => selectPrimaryNavigation(state.agents, state.chats), [state.agents, state.chats]);
  return <nav className={`${styles.navigation} ${props.collapsed ? styles.collapsed : ""}`} aria-label={t("leftSidebar.navigation.primaryChats")}>
    {!props.collapsed && <div className={styles.heading}>
      <span>{t("leftSidebar.navigation.primaryChats")}</span>
      <UiButton size="mini" variant="ghost" onClick={() => props.onOpenHistory()}>{t("leftSidebar.navigation.showHistory")}</UiButton>
    </div>}
    {rows.map(({ agent, chat }) => {
      const active = Boolean(chat && state.chatId === chat.chatId);
      const awaiting = chat?.hasPendingAwaiting === true;
      const running = isChatActiveRun(chat);
      const loading = Boolean(chat && props.getChatLoading(chat.chatId));
      const preview = chat ? String(chat.lastRunContent || chat.chatName || t("leftSidebar.navigation.primaryNoReply")).replace(/\s+/g, " ") : t("leftSidebar.navigation.primaryNoChat");
      const status = awaiting ? t("leftSidebar.navigation.primaryAwaiting") : running ? t("leftSidebar.navigation.primaryRunning") : "";
      return <div className={styles.row} key={agent.key}>
        <button data-agent-pointer-idle="" data-agent-identity="" type="button"
          className={`${styles.item} ${active ? styles.active : ""}`}
          aria-current={active ? "page" : undefined}
          title={`${agent.name}\n${preview}${status ? ` · ${status}` : ""}`}
          aria-label={`${agent.name}, ${preview}${status ? `, ${status}` : ""}`}
          onClick={() => chat ? props.onSelectChat(chat.chatId) : props.onStartPrimary(`agent:${agent.key}`)}>
          <span className={styles.icon}><AgentIcon type="agent" icon={effectiveAgentIcon(agent.icon, agent.mode)}
            props={{ icon: { width: 30, height: 30 }, avatar: { size: 30 } }} /></span>
          {!props.collapsed && <span className={styles.body}>
            <span className={styles.name}>{agent.name}</span>
            <span className={styles.preview}>{preview}</span>
          </span>}
          <span className={styles.status}>
            {awaiting ? <MaterialIcon name="front_hand" /> : (running || loading) ? <MaterialIcon name="progress_activity" className={styles.loading} /> : chat && isChatUnread(chat) ? <span className={styles.unread} /> : null}
          </span>
        </button>
        {!props.collapsed && <UiButton size="mini" variant="ghost" iconOnly className={styles.history}
          title={t("leftSidebar.navigation.showHistory")} aria-label={`${agent.name}: ${t("leftSidebar.navigation.showHistory")}`}
          onClick={() => props.onOpenHistory(agent.key)}><MaterialIcon name="history" /></UiButton>}
      </div>;
    })}
    {!rows.length && !props.collapsed && <div className={styles.empty}>{t("leftSidebar.navigation.primaryEmpty")}</div>}
  </nav>;
}
