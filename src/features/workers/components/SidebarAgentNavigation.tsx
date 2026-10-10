import React, { useEffect, useMemo, useState } from "react";
import { Dropdown } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import { AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import type { WorkerConversationRow, WorkerRow } from "../lib/workerState";
import { GENERAL_CHAT_LIMIT, GENERAL_CHAT_MAX, PROJECT_CHAT_LIMIT, PROJECT_CHAT_MAX, selectGeneralSidebarChats, splitSidebarWorkers, type SidebarChatSort } from "../lib/sidebarNavigation";
import { useSidebarChatPreviews } from "../hooks/useSidebarChatPreviews";
import { WorkerChatPreviewItem } from "./WorkerChatPreviewItem";
import { WorkerActionsMenu, type WorkerActionHandlers } from "./WorkerActionsMenu";
import type { TerminalAgentTerminalStatus } from "@/features/terminal/lib/terminalStatusActivity";
import styles from "./SidebarAgentNavigation.module.css";

export function SidebarAgentNavigation(props: {
  generalAgentKey: string;
  onSelectGeneralAgent: (workerKey: string) => void;
  onNewConversation: (workerKey: string) => void;
  onNewProject: () => void;
  creatingProject: boolean;
  onSelectChat: (chatId: string) => void;
  onOpenHistory: (agentKey?: string) => void;
  getChatLoading: (chatId: string) => boolean;
  chatsByWorker: Map<string, WorkerConversationRow[]>;
  workerActions: WorkerActionHandlers;
  terminalStatuses: ReadonlyMap<string, TerminalAgentTerminalStatus>;
}) {
  const { state } = useAppContext();
  const { t } = useI18n();
  const [sort, setSort] = useState<SidebarChatSort>("byTime");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(state.workerSelectionKey ? [state.workerSelectionKey] : []));
  const [generalOpen, setGeneralOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const groups = useMemo(() => splitSidebarWorkers(state.workerRows, state.agents), [state.workerRows, state.agents]);
  const catalogKey = state.agents.map(agent => `${agent.key}:${String(agent.workspaceDir || "").trim()}`).join("|");
  const preview = useSidebarChatPreviews(true, catalogKey);
  const generalChats = selectGeneralSidebarChats({ chats: state.chats, agents: state.agents, fetchedIds: preview.fetchedIds, pinnedOrder: state.chatPinnedOrder, sort });
  const generalLimit = preview.limits.general || GENERAL_CHAT_LIMIT;
  const selectedGeneral = groups.general.find(row => row.key === props.generalAgentKey);
  const icons = new Map(state.agents.map(agent => [agent.key, agent.icon]));

  useEffect(() => {
    if (state.workerSelectionKey) setExpanded(value => new Set(value).add(state.workerSelectionKey));
  }, [state.workerSelectionKey]);

  const chatRow = (chat: WorkerConversationRow, showOwner: boolean) => {
    const agent = state.agents.find(item => item.key === chat.agentKey);
    return <WorkerChatPreviewItem key={chat.chatId} chat={chat}
      isActive={state.chatId === chat.chatId} loading={props.getChatLoading(chat.chatId)}
      onClick={() => props.onSelectChat(chat.chatId)}
      ownerLabel={showOwner ? agent?.name || chat.agentKey : undefined}
      ownerType={showOwner && agent ? "agent" : undefined} ownerIcon={agent?.icon} />;
  };
  const footer = (key: string, canShowMore: boolean, agentKey?: string) => <div className={styles.footer}>
    {canShowMore && <UiButton size="mini" variant="ghost" disabled={preview.pending[key]}
      onClick={() => preview.showMore(key)}>{t("leftSidebar.navigation.showMore")}</UiButton>}
    <UiButton size="mini" variant="ghost" onClick={() => props.onOpenHistory(agentKey)}>{t("leftSidebar.navigation.showHistory")}</UiButton>
    {preview.pending[key] && <MaterialIcon name="progress_activity" className={styles.loading} />}
    {preview.errors[key] && <UiButton size="mini" variant="ghost" title={preview.errors[key]}
      onClick={() => preview.retry(key)}>{t("leftSidebar.navigation.retry")}</UiButton>}
  </div>;
  const toggleProject = (row: WorkerRow) => setExpanded(value => {
    const next = new Set(value);
    if (next.has(row.key)) next.delete(row.key); else next.add(row.key);
    return next;
  });

  return <div className={styles.navigation}>
    <section aria-label={t("leftSidebar.navigation.chats")}>
      <div className={styles.heading}>
        <button className={styles.sectionTitle} type="button" aria-expanded={generalOpen} onClick={() => setGeneralOpen(!generalOpen)}>
          <span>{t("leftSidebar.navigation.chats")}</span><MaterialIcon name={generalOpen ? "expand_more" : "chevron_right"} />
        </button>
        <div className={styles.headingActions}>
          {selectedGeneral && <Dropdown trigger={["click"]} menu={{ selectedKeys: [selectedGeneral.key],
            onClick: ({ key }) => props.onSelectGeneralAgent(key),
            items: groups.general.map(row => ({ key: row.key, label: row.displayName,
              icon: <AgentIcon type="agent" icon={icons.get(row.sourceId)} props={{ icon: { width: 16, height: 16 }, avatar: { size: 16 } }} /> })) }}>
            <UiButton className={styles.agentSelector} size="mini" variant="ghost" title={t("leftSidebar.navigation.chooseAgent")}>
              <AgentIcon type="agent" icon={icons.get(selectedGeneral.sourceId)} props={{ icon: { width: 14, height: 14 }, avatar: { size: 14 } }} />
              <span>{selectedGeneral.displayName}</span><MaterialIcon name="expand_more" />
            </UiButton>
          </Dropdown>}
          <Dropdown trigger={["click"]} menu={{ selectedKeys: [sort], onClick: ({ key }) => setSort(key as SidebarChatSort),
            items: [{ key: "byTime", label: t("leftSidebar.sort.byTime") }, { key: "byName", label: t("leftSidebar.sort.byName") }] }}>
            <UiButton className={styles.iconButton} size="mini" variant="ghost" iconOnly aria-label={t("leftSidebar.navigation.sort")} title={t("leftSidebar.navigation.sort")}><MaterialIcon name="list_arrow" /></UiButton>
          </Dropdown>
          <UiButton className={styles.iconButton} size="mini" variant="ghost" iconOnly
            aria-label={t("leftSidebar.newConversation")} title={t("leftSidebar.newConversation")} disabled={!selectedGeneral}
            onClick={() => selectedGeneral && props.onNewConversation(selectedGeneral.key)}><MaterialIcon name="edit_square" /></UiButton>
        </div>
      </div>
      {generalOpen && <>
        {generalChats.slice(0, generalLimit).map(chat => chatRow(chat, true))}
        {generalChats.length === 0 && !preview.pending.general && <div className={styles.empty}>{t("leftSidebar.navigation.noChats")}</div>}
        {footer("general", generalLimit < GENERAL_CHAT_MAX && (generalChats.length > generalLimit || preview.moreAvailable.general === true))}
      </>}
    </section>
    <section className={styles.projects} aria-label={t("leftSidebar.navigation.projects")}>
      <div className={styles.heading}>
        <button className={styles.sectionTitle} type="button" aria-expanded={projectsOpen} onClick={() => setProjectsOpen(!projectsOpen)}>
          <span>{t("leftSidebar.navigation.projects")}</span><MaterialIcon name={projectsOpen ? "expand_more" : "chevron_right"} />
        </button>
        <UiButton className={styles.iconButton} size="mini" variant="ghost" iconOnly disabled={props.creatingProject}
          onClick={props.onNewProject} title={t("topNav.newProject")} aria-label={t("topNav.newProject")}><MaterialIcon name="create_new_folder" /></UiButton>
      </div>
      {projectsOpen && groups.projects.map(row => {
        const open = expanded.has(row.key);
        const limit = preview.limits[row.key] || PROJECT_CHAT_LIMIT;
        const chats = (props.chatsByWorker.get(row.key) || []).filter(chat => !chat.pinned && !state.chatPinnedOrder?.includes(chat.chatId));
        const agent = state.agents.find(item => item.key === row.sourceId);
        const status = props.terminalStatuses.get(row.sourceId);
        const attention = chats.some(chat => chat.hasPendingAwaiting || chat.hasActiveRun || chat.isRead === false) || (agent?.stats?.unreadCount || 0) > 0;
        return <div className={styles.project} key={row.key}>
          <div className={styles.projectHead}>
            <WorkerActionsMenu row={row} trigger={["contextMenu"]} {...props.workerActions}>
              <div className={`${styles.projectButton} ${state.workerSelectionKey === row.key ? styles.selectedProject : ""}`} role="button" tabIndex={0}
                aria-label={row.displayName} aria-expanded={open} onClick={() => toggleProject(row)}
                onKeyDown={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); toggleProject(row); } }}>
                <AgentIcon type="agent" icon={icons.get(row.sourceId)} props={{ icon: { width: 18, height: 18 }, avatar: { size: 18 } }} />
                <span className={styles.projectName} title={row.workspaceDir || row.displayName}>{row.displayName}</span>
                {status && <MaterialIcon name="terminal" className={status === "busy" ? styles.loading : styles.terminal} />}
                {attention && <span className={styles.attention} />}
                <MaterialIcon name={open ? "expand_more" : "chevron_right"} className={styles.chevron} />
              </div>
            </WorkerActionsMenu>
            <div className={styles.projectActions}>
              <WorkerActionsMenu row={row} {...props.workerActions}><UiButton size="mini" variant="ghost" iconOnly className={styles.iconButton}
                aria-label={t("leftSidebar.moreActions")}><MaterialIcon name="more_horiz" /></UiButton></WorkerActionsMenu>
              <UiButton size="mini" variant="ghost" iconOnly className={styles.iconButton} aria-label={t("leftSidebar.newConversation")}
                onClick={() => props.onNewConversation(row.key)}><MaterialIcon name="edit_square" /></UiButton>
            </div>
          </div>
          {open && <div className={styles.projectChats}>
            {chats.slice(0, limit).map(chat => chatRow(chat, false))}
            {chats.length === 0 && <div className={styles.empty}>{t("leftSidebar.navigation.noChats")}</div>}
            {footer(row.key, limit < PROJECT_CHAT_MAX && (chats.length > limit || preview.moreAvailable[row.key] === true || (preview.moreAvailable[row.key] === undefined && (agent?.stats?.totalCount || 0) > limit)), row.sourceId)}
          </div>}
        </div>;
      })}
      {projectsOpen && groups.projects.length === 0 && <div className={styles.empty}>{t("leftSidebar.navigation.noProjects")}</div>}
    </section>
  </div>;
}
