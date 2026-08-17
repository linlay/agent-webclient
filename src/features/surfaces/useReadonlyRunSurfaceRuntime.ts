import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@/app/state/types";
import { useAppContext } from "@/app/state/AppContext";
import { useConversationActions } from "@/features/conversation/hooks/useConversationActions";
import { useConversationEventHandler } from "@/features/conversation/hooks/useConversationEventHandler";
import { useRunTransport } from "@/features/transport/hooks/useRealtimeTransport";
import { resolveRunOwner } from "@/features/runs/lib/runOwner";
import { resolveRunAgentKey } from "@/features/runs/lib/runAgentIdentity";
import { toRunOwner } from "@/shared/data/runOwner";
import { useI18n } from "@/shared/i18n";
import { RealtimeTransportError } from "@/features/transport/contracts/realtimeTransportErrors";
import {
  DESKTOP_LIVE_SURFACE_ACTIVE_EVENT,
  type DesktopLiveSurfaceActiveEventDetail,
} from "@/features/transport/lib/desktopSurfaceLifecycle";
import { isDesktopAppMode } from "@/shared/utils/routing";

export type ReadonlyRunSurfaceStatus = "loading" | "ready" | "error";

function eventSeq(event: AgentEvent): number {
  const seq = Number((event as Record<string, unknown>).seq ?? 0);
  return Number.isFinite(seq) && seq >= 0 ? seq : 0;
}

function lastSeqForRun(events: AgentEvent[], runId: string): number {
  let lastSeq = 0;
  for (const event of events) {
    if (runId && String(event.runId || "").trim() !== runId) continue;
    lastSeq = Math.max(lastSeq, eventSeq(event));
  }
  return lastSeq;
}

export function resolveReadonlyActiveRun<T extends { chatId?: unknown; runId?: unknown }>(input: {
  chatId: string;
  requestedRunId?: string;
  activeRun: T | null | undefined;
}): (T & { chatId: string; runId: string }) | null {
  const chatId = String(input.chatId || "").trim();
  const requestedRunId = String(input.requestedRunId || "").trim();
  const activeChatId = String(input.activeRun?.chatId || "").trim();
  const activeRunId = String(input.activeRun?.runId || "").trim();
  if (
    !input.activeRun
    || !chatId
    || activeChatId !== chatId
    || !activeRunId
    || (requestedRunId && requestedRunId !== activeRunId)
  ) {
    return null;
  }
  return {
    ...input.activeRun,
    chatId,
    runId: activeRunId,
  };
}

export function shouldReplayReadonlySurfaceOnLifecycle(
  previousActive: boolean | null,
  nextActive: boolean,
): boolean {
  return previousActive === false && nextActive;
}

export function useReadonlyRunSurfaceRuntime(input: {
  chatId: string;
  runId?: string;
  agentKey?: string;
  role: "overview" | "debug";
}): { status: ReadonlyRunSurfaceStatus; error: string } {
  const { state, stateRef } = useAppContext();
  const actions = useConversationActions();
  const { handleEvent } = useConversationEventHandler();
  const runs = useRunTransport();
  const { t } = useI18n();
  const [status, setStatus] = useState<ReadonlyRunSurfaceStatus>("loading");
  const [error, setError] = useState("");
  const [replayRevision, setReplayRevision] = useState(0);
  const loadEpochRef = useRef(0);
  const bindingEpochRef = useRef(0);
  const recoveredBindingRef = useRef("");
  const desktopSurfaceActiveRef = useRef<boolean | null>(null);

  const replay = useCallback(async () => {
    const epoch = ++loadEpochRef.current;
    setStatus("loading");
    setError("");
    try {
      await actions.loadChat(input.chatId, {
        forceReload: true,
        throwOnError: true,
      });
      if (loadEpochRef.current !== epoch) return;
      setReplayRevision((revision) => revision + 1);
      setStatus("ready");
    } catch (cause) {
      if (loadEpochRef.current !== epoch) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    }
  }, [actions.loadChat, input.chatId]);

  useEffect(() => {
    recoveredBindingRef.current = "";
    if (!input.chatId) {
      setStatus("error");
      setError(t("platformError.code.invalid_request"));
      return;
    }
    void replay();
    return () => {
      loadEpochRef.current += 1;
    };
  }, [input.chatId, input.runId, replay, t]);

  useEffect(() => {
    if (!isDesktopAppMode()) return;
    desktopSurfaceActiveRef.current = null;
    const handleSurfaceActive = (event: Event) => {
      const detail = (event as CustomEvent<DesktopLiveSurfaceActiveEventDetail>).detail;
      const nextActive = detail?.active === true;
      const shouldReplay = shouldReplayReadonlySurfaceOnLifecycle(
        desktopSurfaceActiveRef.current,
        nextActive,
      );
      desktopSurfaceActiveRef.current = nextActive;
      if (shouldReplay) void replay();
    };
    window.addEventListener(DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, handleSurfaceActive);
    return () => {
      desktopSurfaceActiveRef.current = null;
      window.removeEventListener(DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, handleSurfaceActive);
    };
  }, [input.chatId, replay]);

  useEffect(() => {
    if (!input.chatId || status !== "ready") return;
    // Desktop /overview and /debug are replay-only protocol tools. Live state is
    // owned by the enclosing Chat guest's existing RunExecution.
    if (isDesktopAppMode()) return;
    const snapshot = stateRef.current;
    const activeRun = resolveReadonlyActiveRun({
      chatId: input.chatId,
      requestedRunId: input.runId,
      activeRun: snapshot.currentChatActiveRun,
    });
    if (!activeRun) return;
    const runId = activeRun.runId;
    const agentKey = String(
      input.agentKey || resolveRunAgentKey({
        runId,
        runAgentById: snapshot.runAgentById,
        routingAgentKey: snapshot.currentRunAgentKey,
        chatId: input.chatId,
        chatAgentById: snapshot.chatAgentById,
        chats: snapshot.chats,
      }),
    ).trim();
    const owner = resolveRunOwner({
      chatId: input.chatId,
      chats: snapshot.chats,
      currentRunOwner: activeRun?.owner,
      fallbackOwner: toRunOwner({ agentKey }),
    });
    if (!owner) {
      setStatus("error");
      setError(t("platformError.code.invalid_request"));
      return;
    }

    const epoch = ++bindingEpochRef.current;
    let lastSeq = lastSeqForRun(snapshot.events, runId);
    const bindingKey = `${input.chatId}\u0000${runId}`;
    const recoverOnce = (cause: unknown): boolean => {
      if (!(cause instanceof RealtimeTransportError)) return false;
      const code = cause.code;
      if (code !== "seq_expired" && code !== "replay_required") return false;
      if (recoveredBindingRef.current === bindingKey) return false;
      recoveredBindingRef.current = bindingKey;
      void execution.detach();
      void replay();
      return true;
    };
    let execution = runs.subscribe({
      chatId: input.chatId,
      runId,
      owner,
      lastSeq,
      role: input.role,
      onEvent: (event) => {
        if (bindingEpochRef.current !== epoch) return;
        if (String(event.chatId || input.chatId).trim() !== input.chatId) return;
        if (String(event.runId || runId).trim() !== runId) return;
        const seq = eventSeq(event);
        if (seq && seq <= lastSeq) return;
        if (seq && lastSeq && seq > lastSeq + 1) {
          recoverOnce(new RealtimeTransportError(
            "replay_required",
            `Run event gap detected after seq ${lastSeq}`,
            { retryable: true },
          ));
          return;
        }
        if (seq) lastSeq = seq;
        handleEvent(event);
      },
    });
    void execution.identity.catch((cause) => {
      if (bindingEpochRef.current !== epoch || cause?.name === "AbortError") return;
      if (recoverOnce(cause)) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    });
    void execution.completion.then((completion) => {
      if (bindingEpochRef.current !== epoch || !completion.error) return;
      if (recoverOnce(completion.error)) return;
      setError(completion.error.message);
      setStatus("error");
    });

    return () => {
      bindingEpochRef.current += 1;
      void execution.detach();
    };
  }, [
    handleEvent,
    input.agentKey,
    input.chatId,
    input.role,
    input.runId,
    replay,
    replayRevision,
    runs,
    state.currentChatActiveRun,
    stateRef,
    status,
    t,
  ]);

  return { status, error };
}
