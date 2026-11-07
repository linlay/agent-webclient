import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { useAppContext } from "@/app/state/AppContext";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { shouldCreatePrimaryChat } from "@/features/chats/lib/primaryChatIntent";
import { ensureAccessToken, getVoiceCapabilities } from "@/shared/data";
import { isVoiceEnabled } from "@/shared/config/featureFlags";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { VoiceSession } from "../lib/voiceSession";
import type { VoiceChatState } from "../lib/voiceState";

export function useVoiceChatRuntime(): void {
  const { state, stateRef, dispatch } = useAppContext();
  const sessionRef = useRef<VoiceSession | null>(null);
  const capabilitiesRetry = useRef<(() => void) | null>(null);
  const bindingRef = useRef({ agentKey: "", chatId: "" });
  const worker = resolveCurrentWorkerSummary(state);
  const agentKey = worker?.type === "agent" ? worker.sourceId : "";

  useEffect(() => {
    if (!isVoiceEnabled()) return;
    let controller: AbortController | null = null;
    let loaded = false;
    const load = () => {
      if (controller || loaded) return;
      controller = new AbortController();
      const request = controller;
      void getVoiceCapabilities(request.signal).then(capabilities => {
        if (request.signal.aborted) return;
        loaded = true;
        const selected = stateRef.current.voiceChat.selectedVoice;
        dispatch({ type: "PATCH_VOICE_CHAT", patch: {
          capabilities, selectedVoice: capabilities.voices.some(voice => voice.id === selected) ? selected : capabilities.defaultVoice,
        } });
      }).catch(() => {
        // Retry only on an explicit connectivity recovery; disabled is a valid response.
      }).finally(() => { if (controller === request) controller = null; });
    };
    capabilitiesRetry.current = load;
    window.addEventListener("online", load);
    load();
    return () => {
      controller?.abort();
      capabilitiesRetry.current = null;
      window.removeEventListener("online", load);
    };
  }, [dispatch, state.accessToken, stateRef]);

  useEffect(() => {
    if (state.wsStatus === "connected") capabilitiesRetry.current?.();
  }, [state.wsStatus]);

  useEffect(() => {
    const patch = (value: Partial<VoiceChatState>) => dispatch({ type: "PATCH_VOICE_CHAT", patch: value });
    const start = (event: Event) => {
      const detail = (event as CustomEvent<Partial<VoiceChatState>>).detail || {};
      const current = stateRef.current;
      const capabilities = current.voiceChat.capabilities;
      const currentWorker = resolveCurrentWorkerSummary(current);
      if (!isVoiceEnabled() || !capabilities?.enabled || currentWorker?.type !== "agent") return;
      sessionRef.current?.close();
      const binding = { agentKey: currentWorker.sourceId, chatId: current.chatId || "" };
      bindingRef.current = binding;
      const newChat = !binding.chatId;
      const primary = shouldCreatePrimaryChat({
        desktop: isDesktopAppMode(), pathname: window.location.pathname, search: window.location.search,
        agentKey: binding.agentKey, isNewChatQuery: newChat,
        agentMode: current.agents.find(agent => agent.key === binding.agentKey)?.mode,
        primaryNavigation: current.primaryNavigation === true,
        hasPrimary: !current.agents.some(agent => agent.key === binding.agentKey && !agent.primaryChat?.chatId),
      });
      const session = new VoiceSession({
        capabilities, agentKey: binding.agentKey, chatId: binding.chatId,
        newChat, primary,
        voice: detail.selectedVoice || current.voiceChat.selectedVoice || capabilities.defaultVoice, mode: detail.mode || current.voiceChat.mode,
        patch: value => { if (sessionRef.current === session) patch(value); },
        onRun: (chatId, runId) => {
          if (sessionRef.current !== session) return;
          const current = stateRef.current;
          if (current.inputMode !== "voice" || resolveCurrentWorkerSummary(current)?.sourceId !== binding.agentKey ||
            (current.chatId || "") !== binding.chatId) return;
          const promoteChat = !binding.chatId;
          binding.chatId = chatId;
          // Canonical IDs from voice reuse the existing Chat/Run attach and event reducer.
          flushSync(() => {
            if (stateRef.current.chatId !== chatId) {
              dispatch({ type: "RESET_ACTIVE_CONVERSATION", preserveVoiceSession: true });
              dispatch({ type: "SET_CHAT_ID", chatId });
            }
            dispatch({ type: "SET_CHAT_AGENT_BY_ID", chatId, agentKey: binding.agentKey });
            dispatch({ type: "PATCH_VOICE_CHAT", patch: { sessionActive: true, status: "thinking", currentAgentKey: binding.agentKey, currentAgentName: currentWorker.displayName } });
            dispatch({ type: "SET_CURRENT_CHAT_ACTIVE_RUN", activeRun: {
              chatId, runId, agentKey: binding.agentKey, owner: { kind: "agent", agentKey: binding.agentKey },
            } });
          });
          window.dispatchEvent(new CustomEvent("agent:attach-run", { detail: {
            chatId, runId, agentKey: binding.agentKey, owner: { kind: "agent", agentKey: binding.agentKey }, lastSeq: 0,
          } }));
          if (promoteChat) window.dispatchEvent(new CustomEvent("agent:new-chat-created", {
            detail: { chatId, agentKey: binding.agentKey },
          }));
        },
      });
      sessionRef.current = session;
      session.setMuted(current.audioMuted);
      patch({ status: "connecting", sessionActive: false, awaiting: false, error: "", partialUserText: "", partialAssistantText: "",
        currentAgentKey: binding.agentKey, currentAgentName: currentWorker.displayName });
      // prepare() invokes AudioContext.resume/getUserMedia within this click/keyboard gesture.
      void session.prepare().then(() => sessionRef.current !== session || isDesktopAppMode() ? "" : ensureAccessToken()).then(token => {
        if (sessionRef.current === session) session.connect(token);
      }).catch(error => {
        session.close();
        if (sessionRef.current === session) patch({ status: "error", sessionActive: false,
          error: error instanceof Error ? error.message : String(error) });
      });
    };
    const abort = () => sessionRef.current?.abort();
    const stop = () => sessionRef.current?.stopListening();
    const resume = () => sessionRef.current?.listen();
    const leave = () => {
      sessionRef.current?.close();
      sessionRef.current = null;
      dispatch({ type: "SET_INPUT_MODE", mode: "text" });
      patch({ status: "idle", sessionActive: false, awaiting: false });
    };
    const visibility = () => { if (document.hidden) leave(); };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("agent:voice-start", start);
    window.addEventListener("agent:voice-abort", abort);
    window.addEventListener("agent:voice-listen-stop", stop);
    window.addEventListener("agent:voice-listen", resume);
    return () => {
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("agent:voice-start", start);
      window.removeEventListener("agent:voice-abort", abort);
      window.removeEventListener("agent:voice-listen-stop", stop);
      window.removeEventListener("agent:voice-listen", resume);
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, [dispatch, stateRef]);

  useEffect(() => {
    const binding = bindingRef.current;
    if (state.inputMode === "voice" && agentKey === binding.agentKey &&
      (state.chatId || "") === binding.chatId) return;
    sessionRef.current?.close();
    sessionRef.current = null;
    dispatch({ type: "PATCH_VOICE_CHAT", patch: { status: "idle", sessionActive: false, awaiting: false } });
    if (state.inputMode === "voice") dispatch({ type: "SET_INPUT_MODE", mode: "text" });
  }, [agentKey, dispatch, state.chatId, state.inputMode]);

  useEffect(() => { sessionRef.current?.setMuted(state.audioMuted); }, [state.audioMuted]);
}
