import React from "react";
import { useChatPreview } from "@/features/conversation/hooks/useChatPreview";
import { ReadOnlyConversationTimeline } from "./ReadOnlyConversationTimeline";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import styles from "./ChatPreviewSurface.module.css";

export function ChatPreviewSurface({ chatId, live }: { chatId: string; live: boolean }) {
  const { t } = useI18n();
  const { state, reload } = useChatPreview(chatId, live);
  const snapshot = state?.snapshot;
  const owner = snapshot?.owner;
  const agentKey = owner?.kind === "agent" ? owner.agentKey : "";
  const status = !live ? "snapshot" : !state?.active ? "inactive"
    : state.error ? "unavailable"
    : state.connection !== "connected" ? "reconnecting"
    : snapshot?.chat.activeRun ? "running" : "history";
  return <main className={styles.root} aria-label={t("chatPreview.title")}>
    <header className={styles.header}>
      <strong title={String(snapshot?.chat.chatName || chatId)}>{String(snapshot?.chat.chatName || t("chatPreview.title"))}</strong>
      <span role="status">{t(`chatPreview.status.${status}`)}</span>
    </header>
    {state?.error && <div className={styles.error} role="alert">
      <span>{state.error}</span>
      <UiButton size="sm" variant="ghost" onClick={reload} disabled={!state.active}>{t("chatPreview.reload")}</UiButton>
    </div>}
    {(!state || state.loading) && <div className={styles.notice} role="status">{t("surface.loading")}</div>}
    {live && snapshot?.chat.activeRun && snapshot.projection.state.activeAwaiting &&
      <div className={styles.notice}>{t("chatPreview.awaiting")}</div>}
    <section className={styles.body} aria-busy={!state || state.loading}>
      {snapshot && <ReadOnlyConversationTimeline
        key={`${chatId}:${live}`}
        chat={snapshot.chat} projection={snapshot.projection}
        agents={agentKey ? [{ key: agentKey, name: snapshot.chat.firstAgentName || agentKey }] : []}
        agentKey={agentKey} teamChat={owner?.kind === "orchestrated-team"} startAtBottom
        ariaLabel={t("chatPreview.title")} emptyLabel={t("chatPreview.empty")}
      />}
    </section>
  </main>;
}
