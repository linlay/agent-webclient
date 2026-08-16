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

export function useReadonlyRunSurfaceRuntime(input: {
  chatId: string;
  runId?: string;
  agentKey?: string;
  role: "summary" | "debug";
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
    if (!input.chatId) {
      setStatus("error");
      setError(t("platformError.code.invalid_request"));
      return;
    }
    void replay();
    return () => {
      loadEpochRef.current += 1;
    };
  }, [input.chatId, replay, t]);

  useEffect(() => {
    if (!input.chatId || status !== "ready") return;
    const snapshot = stateRef.current;
    const activeRun = snapshot.currentChatActiveRun?.chatId === input.chatId
      ? snapshot.currentChatActiveRun
      : null;
    const runId = String(input.runId || activeRun?.runId || snapshot.runId || "").trim();
    if (!runId) return;
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
    let recoveredGap = false;
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
          if (!recoveredGap) {
            recoveredGap = true;
            void execution.detach();
            void replay();
          }
          return;
        }
        if (seq) lastSeq = seq;
        handleEvent(event);
      },
    });
    void execution.accepted.catch((cause) => {
      if (bindingEpochRef.current !== epoch || cause?.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    });
    void execution.completion.then((completion) => {
      if (bindingEpochRef.current !== epoch || !completion.error) return;
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
    state.runId,
    stateRef,
    status,
    t,
  ]);

  return { status, error };
}
