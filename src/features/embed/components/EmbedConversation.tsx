import type { AgentEvent } from "@/shared/contracts/agentEvents";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ConversationFileDropProvider } from "@/shared/ui/ConversationFileDrop";
import { Button, Drawer, List, Alert, App as AntdApp } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import { getAgent, getChat, getChats, archiveChats } from "@/shared/data";
import { emitEmbedEvent, getEmbedOptions } from "@/shared/data/embed/embedSession";
import { setEmbedContext } from "@/shared/data/embed/hostContext";
import { useI18n } from "@/shared/i18n";
import { useAppearance } from "@/features/appearance/components/AppearanceProvider";
import { useConversationEventHandler } from "@/features/conversation/hooks/useConversationEventHandler";
import { useConversationWsRuntime } from "@/features/conversation/hooks/useConversationWsRuntime";
import { useConversationActions } from "@/features/conversation/hooks/useConversationActions";
import { useConversationRouteLoad } from "@/features/conversation/hooks/useConversationRouteLoad";
import { useMainChatRunActivation } from "@/features/runs/hooks/useMainChatRunActivation";
import { useMessageActions } from "@/features/composer/hooks/useMessageActions";
import { ConversationSurfaceProvider } from "@/features/conversation/components/ConversationSurfaceProvider";
import { TimelineTextSearchProvider } from "@/features/timeline/components/TimelineTextSearchProvider";
import { ConnectedConversationStage } from "@/features/timeline/components/ConnectedConversationStage";
import { ContentViewerPanel } from "@/features/viewers/components/ContentViewerPanel";
import { useOpenTarget } from "@/features/surfaces/hooks/useOpenTarget";
import { useRunFeedbackAction } from "@/features/conversation/hooks/useRunFeedbackAction";
import type { Agent } from "@/features/agents/lib/agentState";
import type { Chat } from "@/features/chats/lib/chatState";
import type { ViewerTarget } from "@/features/viewers/lib/viewerTarget";
import styles from "./EmbedConversation.module.css";

interface Command { type: string; payload?: unknown; handled: boolean; resolve: (result: unknown) => void; reject: (error: Error) => void }

export function EmbedConversation({ agentKey, children }: React.PropsWithChildren<{ agentKey: string }>) {
  const { state, dispatch } = useAppContext();
  const options = getEmbedOptions();
  const { t, setLocale } = useI18n();
  const { controller } = useAppearance();
  const { modal } = AntdApp.useApp();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [error, setError] = useState("");
  const [authRevision, setAuthRevision] = useState(0);
  const [targetChatId, setTargetChatId] = useState("");
  const [history, setHistory] = useState<Chat[] | null>(null);
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const { handleEvent } = useConversationEventHandler();
  const emittedRuns = useRef(new Set<string>());
  const onAgentEvent = useCallback((event: AgentEvent) => {
    handleEvent(event);
    const runId = String(event.runId || "");
    const type = event.type === "run.start" ? "run.started" : ["run.complete", "run.cancel", "run.error"].includes(event.type) ? "run.finished" : "";
    const key = `${type}:${runId}`;
    if (type && runId && !emittedRuns.current.has(key)) {
      emittedRuns.current.add(key);
      emitEmbedEvent(type, { runId, chatId: event.chatId, reason: event.type });
    }
  }, [handleEvent]);
  useMainChatRunActivation();
  useConversationWsRuntime({ onAgentEvent });
  useMessageActions({ onAgentEvent });
  const actions = useConversationActions();
  useConversationRouteLoad(actions, targetChatId, Boolean(targetChatId) || Boolean(agent));
  const openTarget = useOpenTarget();
  const onFeedback = useRunFeedbackAction();
  const initialized = useRef(false);
  const announced = useRef(false);
  const lastChat = useRef("");
  const running = Boolean(state.streaming || state.currentChatActiveRun?.runId || state.activeAwaiting);

  useEffect(() => {
    if (options.theme) controller.setThemePreference(options.theme);
    if (options.locale) setLocale(options.locale, { persist: false });
  }, [controller, options, setLocale]);

  useEffect(() => {
    const recover = () => { setError(""); setAuthRevision(value => value + 1); };
    window.addEventListener("agent:embed-auth-recovered", recover);
    return () => window.removeEventListener("agent:embed-auth-recovered", recover);
  }, []);
  useEffect(() => {
    let active = true;
    void getAgent(agentKey).then(async ({ data }) => {
      if (!active) return;
      const loaded = data as unknown as Agent;
      setAgent(loaded);
      dispatch({ type: "SET_CURRENT_AGENT", agent: loaded });
      dispatch({ type: "SET_WORKER_SELECTION_KEY", workerKey: `agent:${agentKey}` });
      dispatch({ type: "SET_WORKER_PRIORITY_KEY", workerKey: `agent:${agentKey}` });
      dispatch({ type: "SET_PENDING_NEW_CHAT_AGENT_KEY", agentKey });
      if (!initialized.current && !options.chatId) setTargetChatId(data.primaryChat?.chatId || "");
      initialized.current = true;
    }).catch(() => { if (active) { initialized.current = true; setError(t("composer.agent.unavailable")); emitEmbedEvent("error", { code: "agent_unavailable" }); } });
    return () => { active = false; };
  }, [agentKey, authRevision, dispatch, options.chatId, t]);

  // Existing chat loading does not wait for current Agent hydration or availability.
  useEffect(() => {
    dispatch({ type: "SET_WORKER_SELECTION_KEY", workerKey: `agent:${agentKey}` });
    if (!options.chatId) return;
    let active = true;
    void getChat(options.chatId).then(({ data }) => {
      if ((data.agentKey || data.firstAgentKey) !== agentKey) throw new Error("chat_agent_mismatch");
      if (active) setTargetChatId(options.chatId!);
    }).catch(() => {
      if (active) { setError(t("embed.chatUnavailable")); emitEmbedEvent("error", { code: "chat_unavailable" }); }
    });
    return () => { active = false; };
  }, [agentKey, dispatch, options.chatId, t]);

  const openChat = useCallback(async (chatId: string) => {
    if (!chatId || chatId.length > 256) throw new Error("invalid_chat");
    // Validate identity before changing the surface. Server ACL remains authoritative.
    const { data } = await getChat(chatId);
    const owner = data.agentKey || data.firstAgentKey;
    if (owner !== agentKey) throw new Error("chat_agent_mismatch");
    setTargetChatId(chatId); setHistory(null); setViewer(null);
  }, [agentKey]);

  const newChat = useCallback(async () => {
    if (!options.features?.newChat) throw new Error("feature_disabled");
    if (running) throw new Error("chat_busy");
    if (agent?.mode?.toUpperCase() === "BOT") {
      const confirmed = await new Promise<boolean>(resolve => modal.confirm({
        title: t("embed.restart.title"), content: t("embed.restart.warning"),
        okText: t("embed.restart.confirm"), cancelText: t("embed.cancel"),
        onOk: () => resolve(true), onCancel: () => resolve(false),
      }));
      if (!confirmed) throw new Error("cancelled");
      if (latest.current.running) throw new Error("chat_busy");
      if (agent.primaryChat?.chatId) await archiveChats({ chatIds: [agent.primaryChat.chatId] });
    }
    setTargetChatId(""); setViewer(null);
    actions.startNewConversation({ agentKey, preserveWorkerContext: true, focusComposerOnComplete: true });
    emitEmbedEvent("chat.changed", { chatId: null });
  }, [actions.startNewConversation, agent, agentKey, modal, options.features?.newChat, running, t]);

  const latest = useRef({ agent, running, openChat, newChat }); latest.current = { agent, running, openChat, newChat };
  useEffect(() => {
    const listener = (event: Event) => {
      const command = (event as CustomEvent<Command>).detail;
      command.handled = true;
      void (async () => {
        if (!initialized.current) throw new Error("not_ready");
        const payload = command.payload && typeof command.payload === "object" ? command.payload as Record<string, unknown> : {};
        switch (command.type) {
          case "send": case "prefill": case "interrupt": {
            if (command.type !== "interrupt" && (typeof payload.text !== "string" || payload.text.length > 50_000)) throw new Error("invalid_message");
            return new Promise((resolve, reject) => {
              const detail = { type: command.type, text: payload.text, handled: false, resolve, reject };
              window.dispatchEvent(new CustomEvent("agent:embed-composer", { detail }));
              if (!detail.handled) reject(new Error("composer_unavailable"));
            });
          }
          case "focus": window.dispatchEvent(new CustomEvent("agent:focus-composer")); return;
          case "setTheme":
            if (!["light", "dark", "system"].includes(String(payload.theme))) throw new Error("invalid_theme");
            controller.setThemePreference(payload.theme as "light" | "dark" | "system"); return;
          case "setContext": setEmbedContext(command.payload); return;
          case "openChat": return latest.current.openChat(String(payload.chatId || ""));
          case "newChat": return latest.current.newChat();
          default: throw new Error("unsupported_command");
        }
      })().then(command.resolve, command.reject);
    };
    const viewListener = (event: Event) => { setViewer((event as CustomEvent<ViewerTarget>).detail); };
    const loadListener = (event: Event) => {
      const chatId = String((event as CustomEvent).detail?.chatId || "");
      if (chatId) void latest.current.openChat(chatId).catch(() => emitEmbedEvent("error", { code: "chat_unavailable" }));
    };
    const createdListener = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.chatId) {
        setTargetChatId(detail.chatId);
        // A restarted BOT's primary pointer changes with the first accepted message.
        const current = latest.current.agent;
        if (current?.mode?.toUpperCase() === "BOT") {
          const updated = { ...current, primaryChat: { ...current.primaryChat, chatId: detail.chatId } } as Agent;
          setAgent(updated);
          dispatch({ type: "SET_CURRENT_AGENT", agent: updated });
        }
      }
    };
    window.addEventListener("agent:embed-command", listener);
    window.addEventListener("agent:embed-viewer", viewListener);
    window.addEventListener("agent:load-chat", loadListener);
    window.addEventListener("agent:new-chat-created", createdListener);
    return () => {
      window.removeEventListener("agent:embed-command", listener);
      window.removeEventListener("agent:embed-viewer", viewListener);
      window.removeEventListener("agent:load-chat", loadListener);
      window.removeEventListener("agent:new-chat-created", createdListener);
    };
  }, [controller]);

  useEffect(() => {
    if (!initialized.current || (!targetChatId && (!agent || state.agentAvailability[agentKey] !== "available")) || state.chatSurfaceBlocked || state.chatTransition?.phase === "loading") return;
    if (state.chatTransition?.phase === "error") { emitEmbedEvent("error", { code: "chat_unavailable" }); return; }
    if (targetChatId && state.chatId !== targetChatId) return;
    if (!announced.current) { announced.current = true; emitEmbedEvent("ready", { agentKey, chatId: state.chatId || null }); }
    if (state.chatId !== lastChat.current) { lastChat.current = state.chatId; emitEmbedEvent("chat.changed", { chatId: state.chatId || null }); }
  }, [agent, agentKey, state.agentAvailability, state.chatSurfaceBlocked, state.chatId, state.chatTransition, targetChatId]);
  useEffect(() => { emitEmbedEvent("awaiting.pending", { pending: Boolean(state.activeAwaiting) }); }, [state.activeAwaiting]);

  const showHistory = async () => {
    try {
      const { data } = await getChats({ agentKey, limit: 100 });
      const chats = Array.isArray(data) ? data : (data as { chats?: Chat[] })?.chats || [];
      setHistory(chats.filter((chat: Chat) => (chat.agentKey || chat.firstAgentKey) === agentKey));
    } catch { emitEmbedEvent("error", { code: "history_unavailable" }); }
  };
  if (error && !targetChatId) return <main className={styles.blocked}><Alert type="error" message={error} /></main>;
  return <ConversationSurfaceProvider expectedChatId={targetChatId || undefined}>
    <TimelineTextSearchProvider><ConversationFileDropProvider>
      <main className={styles.shell}>
        <header className={styles.header}>
          <strong className={styles.title}>{agent?.name || agentKey}</strong>
          {options.features?.history && agent?.mode?.toUpperCase() !== "BOT" && <Button size="small" onClick={() => void showHistory()}>{t("embed.history")}</Button>}
          {options.features?.newChat && <Button size="small" disabled={running || !agent} onClick={() => void newChat().catch(error => { if (error.message !== "cancelled") emitEmbedEvent("error", { code: "new_chat_failed" }); })}>{t("embed.newChat")}</Button>}
        </header>
        <ConnectedConversationStage surfaceMode="copilot" deriveChatAction={{ isDisabled: () => true, execute: async () => { throw new Error("feature_disabled"); } }} onFeedback={onFeedback} expectedChatId={targetChatId || undefined} showEmptyState={false} />
        {children}
      </main>
      <Drawer title={t("embed.history")} open={history !== null} onClose={() => setHistory(null)} width="min(100vw, 420px)">
        <List dataSource={history || []} renderItem={chat => <List.Item><Button type="link" onClick={() => void openChat(chat.chatId).catch(() => emitEmbedEvent("error", { code: "chat_unavailable" }))}>{chat.chatName || chat.chatId}</Button></List.Item>} />
      </Drawer>
      <Drawer title={viewer?.name || t("embed.preview")} open={Boolean(viewer)} onClose={() => setViewer(null)} width="min(100vw, 760px)" destroyOnClose>
        {viewer && <div className={styles.viewer}><ContentViewerPanel target={viewer} textEditMode={false} enableDesktopCurrentResourceDownload={false} enableDesktopLocalResourceActions={false} enableDesktopPreviewReview={false} onOpenTarget={openTarget} /></div>}
      </Drawer>
    </ConversationFileDropProvider></TimelineTextSearchProvider>
  </ConversationSurfaceProvider>;
}
