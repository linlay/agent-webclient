import React, { useLayoutEffect, useRef } from "react";
import { useAppContext } from "@/app/state/AppContext";
import { useChatPreview } from "../hooks/useChatPreview";
import { ConversationSurfaceProvider } from "./ConversationSurfaceProvider";
import { ConnectedConversationStage } from "@/features/timeline/components/ConnectedConversationStage";
import { TimelineTextSearchProvider } from "@/features/timeline/components/TimelineTextSearchProvider";
import { ConversationFileDropProvider } from "@/shared/ui/ConversationFileDrop";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import styles from "./ChatTimelineSurface.module.css";

const noMutation = async () => {};
const deriveChatAction = { isDisabled: () => true, execute: noMutation };

/** The actual chat-page timeline; the host owns sending and this surface only observes. */
export function ChatTimelineSurface({ chatId, live }: { chatId: string; live: boolean }) {
  const { t } = useI18n();
  const { state: preview, reload } = useChatPreview(chatId, live);
  const { state, stateRef, dispatch } = useAppContext();
  const snapshot = preview?.snapshot;
  const appliedExpansion = useRef(new Map<string, boolean | undefined>());
  const userExpansion = useRef(new Map<string, boolean | undefined>());

  useLayoutEffect(() => {
    if (!snapshot) return;
    const { chat, projection, owner } = snapshot;
    const agentKey = owner?.kind === "agent" ? owner.agentKey : "";
    // Keep the server's display.effectiveDetail; a preview default changes the entire layout.
    dispatch({ type: "UPSERT_CHAT", chat: {
      chatId, agentKey, firstAgentKey: chat.firstAgentKey,
      firstAgentName: chat.firstAgentName, display: chat.display,
      activeRun: chat.activeRun, hasActiveRun: chat.hasActiveRun, owner: owner ?? undefined,
    } });
    if (agentKey && !stateRef.current.agents.some(agent => agent.key === agentKey)) {
      dispatch({ type: "SET_AGENTS", agents: [...stateRef.current.agents,
        { key: agentKey, name: chat.firstAgentName || agentKey }] });
    }
    // User expansion is presentation state: live events must not reset it.
    for (const [id, expanded] of appliedExpansion.current) {
      const current = stateRef.current.timelineNodes.get(id);
      if (current && current.expanded !== expanded) userExpansion.current.set(id, current.expanded);
    }
    const timelineNodes = new Map(projection.state.timelineNodes);
    for (const [id, node] of timelineNodes) {
      if (userExpansion.current.has(id)) timelineNodes.set(id, { ...node, expanded: userExpansion.current.get(id) });
    }
    appliedExpansion.current = new Map([...timelineNodes].map(([id, node]) => [id, node.expanded]));
    dispatch({ type: "APPLY_CONVERSATION_REPLAY", snapshot: {
      ...projection.state, timelineNodes,
      currentChatActiveRun: live && chat.activeRun ? { ...chat.activeRun, chatId } : null,
      runId: chat.activeRun?.runId || projection.state.runId,
      downvotedRunKeys: new Set<string>(),
    } });
    dispatch({ type: "SET_STREAMING", streaming: Boolean(live && chat.activeRun && preview?.active && preview.connection === "connected") });
  }, [chatId, dispatch, live, snapshot, preview?.active, preview?.connection, stateRef]);

  return <main className={`${styles.root} layout-desktop-fixed`} aria-label={t("chatPreview.title")}>
    {preview?.error && <div className={styles.error} role="alert">
      <span>{preview.error}</span>
      <UiButton size="sm" variant="ghost" onClick={reload} disabled={!preview.active}>{t("chatPreview.reload")}</UiButton>
    </div>}
    {(!preview || preview.loading) && !snapshot && <div className={styles.notice} role="status">{t("surface.loading")}</div>}
    {live && snapshot?.chat.activeRun && snapshot.projection.state.activeAwaiting &&
      <div className={styles.notice}>{t("chatPreview.awaiting")}</div>}
    {snapshot && state.chatId === chatId && <ConversationFileDropProvider>
      <ConversationSurfaceProvider expectedChatId={chatId}>
        <TimelineTextSearchProvider>
          <ConnectedConversationStage surfaceMode="agent" readOnly expectedChatId={chatId}
            showEmptyState={false} deriveChatAction={deriveChatAction} onFeedback={noMutation} />
        </TimelineTextSearchProvider>
      </ConversationSurfaceProvider>
    </ConversationFileDropProvider>}
  </main>;
}
