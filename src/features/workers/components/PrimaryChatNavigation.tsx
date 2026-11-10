import React, { useMemo, useState } from "react";
import { Dropdown } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import { AgentIcon } from "@/shared/icons/agent";
import { effectiveAgentIcon } from "@/shared/icons/agentAppearance";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import { isChatActiveRun } from "@/features/chats/lib/chatRunState";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
import { selectPrimaryNavigation } from "../lib/primaryNavigation";
import { SidebarOverflowText } from "./SidebarOverflowText";
import styles from "./PrimaryChatNavigation.module.css";
import { useSidebarOrder } from "../hooks/useSidebarOrder";
import { SidebarSortableList } from "./SidebarSortableList";
import navigationStyles from "./SidebarAgentNavigation.module.css";

export interface PrimaryChatNavigationProps {
  collapsed?: boolean;
  pinnedOnly?: boolean;
  onSelectChat: (chatId: string) => void;
  onStartPrimary: (workerKey: string) => void;
  onOpenHistory: (agentKey?: string) => void;
  onClearPrimary?: (agentKey: string, chatId: string) => void;
  onEditAgent?: (agentKey: string) => void;
  getChatLoading: (chatId: string) => boolean;
}

export function PrimaryChatNavigation(props: PrimaryChatNavigationProps) {
  const { state } = useAppContext();
  const { t } = useI18n();
  const [menuAgent, setMenuAgent] = useState("");
  const [expanded, setExpanded] = useState(true);
  const order = useSidebarOrder("bots");
  const pins = useSidebarOrder("pinned-bots");
  const allRows = useMemo(() => selectPrimaryNavigation(state.agents, state.chats), [state.agents, state.chats]);
  const rows = allRows.filter(row => pins.ids.includes(row.agent.key) === Boolean(props.pinnedOnly));
  const rowOrder = props.pinnedOnly ? pins : order;
  if (!allRows.length || (props.pinnedOnly && !rows.length)) return null;
  return <nav className={`${styles.navigation} ${props.collapsed ? styles.collapsed : ""} ${props.pinnedOnly ? styles.pinned : ""}`} aria-label={t("leftSidebar.navigation.primaryChats")}>
    {!props.collapsed && !props.pinnedOnly && <div className={navigationStyles.heading}>
      <button className={navigationStyles.sectionTitle} type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span>{t("leftSidebar.navigation.primaryChats")}</span><MaterialIcon name={expanded ? "expand_more" : "chevron_right"} />
      </button>
    </div>}
    {(props.collapsed || props.pinnedOnly || expanded) && <SidebarSortableList items={rowOrder.sort(rows, row => row.agent.key)} getId={row => row.agent.key} onMove={rowOrder.move} renderItem={({ agent, chat }, drag) => {
      const active = Boolean(chat && state.chatId === chat.chatId);
      const awaiting = chat?.hasPendingAwaiting === true;
      const running = isChatActiveRun(chat);
      const loading = Boolean(chat && props.getChatLoading(chat.chatId));
      const unread = Boolean(chat && isChatUnread(chat));
      const preview = chat ? String(chat.lastRunContent || chat.chatName || t("leftSidebar.navigation.primaryNoReply")).replace(/\s+/g, " ") : t("leftSidebar.navigation.primaryNoChat");
      const status = awaiting ? t("leftSidebar.navigation.primaryAwaiting") : running ? t("leftSidebar.navigation.primaryRunning") : "";
      return <div {...drag} className={`${styles.row} ${drag.className}`} data-menu-open={menuAgent === agent.key || undefined}>
        <button data-agent-pointer-idle="" data-agent-identity="" type="button"
          className={`${styles.item} ${active ? styles.active : ""}`}
          aria-current={active ? "page" : undefined}
          title={`${agent.name}\n${preview}${status ? ` · ${status}` : ""}`}
          aria-label={`${agent.name}, ${preview}${status ? `, ${status}` : ""}`}
          onClick={() => chat ? props.onSelectChat(chat.chatId) : props.onStartPrimary(`agent:${agent.key}`)}>
          <span className={styles.icon}><AgentIcon type="agent" icon={effectiveAgentIcon(agent.icon, agent.mode)}
            props={{ icon: { width: 36, height: 36 }, avatar: { size: 36 } }} />
            {agent.workspaceDir && <span className={styles.workspace} title={agent.workspaceDir}><MaterialIcon name="folder" /></span>}
          </span>
          {!props.collapsed && <span className={styles.body}>
            <SidebarOverflowText className={styles.name} text={agent.name} />
            <SidebarOverflowText className={styles.preview} text={preview} />
          </span>}
          {(awaiting || running || loading || unread) && <span className={styles.status}>
            {awaiting ? <MaterialIcon name="front_hand" /> : (running || loading) ? <MaterialIcon name="progress_activity" className={styles.loading} /> : unread ? <span className={styles.unread} /> : null}
          </span>}
        </button>
        <Dropdown trigger={["click"]} onOpenChange={open => setMenuAgent(open ? agent.key : "")} menu={{
          items: [
            { key: "pin", icon: <MaterialIcon name="push_pin" />, label: t(pins.ids.includes(agent.key) ? "leftSidebar.navigation.unpinBot" : "leftSidebar.navigation.pinBot") },
            { key: "history", icon: <MaterialIcon name="history" />, label: t("leftSidebar.navigation.showHistory") },
            ...(props.onEditAgent ? [{ key: "settings", icon: <MaterialIcon name="settings" />, label: t("leftSidebar.editAgent") }] : []),
            { type: "divider" },
            { key: "clearPrimary", icon: <MaterialIcon name="archive" />, label: t("leftSidebar.navigation.clearPrimary"), disabled: !chat || running || awaiting || !props.onClearPrimary },
          ],
          onClick: ({ key, domEvent }) => {
            domEvent.stopPropagation();
            if (key === "pin") pins.toggle(agent.key);
            if (key === "history") props.onOpenHistory(agent.key);
            if (key === "settings") props.onEditAgent?.(agent.key);
            if (key === "clearPrimary" && chat && !running && !awaiting) props.onClearPrimary?.(agent.key, chat.chatId);
          },
        }}>
          <UiButton size="mini" variant="ghost" iconOnly className={styles.history}
            title={t("leftSidebar.moreActions")} aria-label={`${agent.name}: ${t("leftSidebar.moreActions")}`}>
            <MaterialIcon name="more_horiz" />
          </UiButton>
        </Dropdown>
      </div>;
    }} />}
  </nav>;
}
