import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@/app/state/types";
import type { ChatDetailResponse } from "@/shared/data";
import { ApiError, getChat } from "@/shared/data";
import { toRunOwner, type RunOwner } from "@/shared/data/runOwner";
import {
  buildChatReplayProjection,
} from "@/features/conversation/lib/chatReplayProjection";
import {
  replayEvent,
  type ReplayState,
} from "@/features/conversation/lib/conversationReplay";
import { useRunTransport } from "@/features/transport/hooks/useRealtimeTransport";
import type { RunExecution } from "@/features/transport/contracts/realtimeTransport";
import { RealtimeTransportError } from "@/features/transport/contracts/realtimeTransportErrors";
import {
  DESKTOP_LIVE_SURFACE_ACTIVE_EVENT,
  type DesktopLiveSurfaceActiveEventDetail,
} from "@/features/transport/lib/desktopSurfaceLifecycle";
import { t } from "@/shared/i18n/runtime";
import { isDesktopAppMode } from "@/shared/utils/routing";

export type ChatSurfaceReplayStatus = "loading" | "ready" | "error";

export interface ChatSurfaceReplaySnapshot {
  chat: ChatDetailResponse;
  projection: ReplayState;
  owner: RunOwner | null;
  activeRun: Record<string, unknown> | null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function eventSeq(event: AgentEvent): number {
  const seq = Number((event as Record<string, unknown>).seq ?? 0);
  return Number.isFinite(seq) && seq >= 0 ? seq : 0;
}

export function shouldReloadChatSurfaceOnLifecycle(
  previousActive: boolean | null,
  nextActive: boolean,
): boolean {
  return previousActive === false && nextActive;
}

export function classifyChatSurfaceEvent(input: {
  event: AgentEvent;
  chatId: string;
  runId: string;
  lastSeq: number;
}): { action: "apply" | "ignore" | "reload"; nextSeq: number } {
  const eventChatId = String(input.event.chatId || input.chatId).trim();
  const eventRunId = String(input.event.runId || input.runId).trim();
  const seq = eventSeq(input.event);
  if (eventChatId !== input.chatId || eventRunId !== input.runId) {
    return { action: "ignore", nextSeq: input.lastSeq };
  }
  if (seq && seq <= input.lastSeq) {
    return { action: "ignore", nextSeq: input.lastSeq };
  }
  if (seq && input.lastSeq && seq > input.lastSeq + 1) {
    return { action: "reload", nextSeq: input.lastSeq };
  }
  return { action: "apply", nextSeq: seq || input.lastSeq };
}

function lastSeqForRun(events: AgentEvent[], runId: string): number {
  let lastSeq = 0;
  for (const event of events) {
    if (runId && String(event.runId || "").trim() !== runId) continue;
    lastSeq = Math.max(lastSeq, eventSeq(event));
  }
  return lastSeq;
}

function normalizedSeq(value: unknown): number {
  const seq = Number(value);
  return Number.isFinite(seq) && seq >= 0 ? Math.floor(seq) : 0;
}

export function chatSurfaceReplayErrorCode(cause: unknown): string {
  if (cause instanceof RealtimeTransportError) return String(cause.code || "").trim();
  if (cause instanceof ApiError) {
    const directCode = typeof cause.code === "string" ? cause.code.trim() : "";
    if (directCode) return directCode;
    return String(cause.platformError?.code || "").trim();
  }
  const record = objectRecord(cause);
  const directCode = typeof record?.code === "string" ? record.code.trim() : "";
  if (directCode) return directCode;
  const platformError = objectRecord(record?.platformError);
  return typeof platformError?.code === "string" ? platformError.code.trim() : "";
}

export function decideChatSurfaceReplayRecovery(input: {
  cause: unknown;
  bindingKey: string;
  attemptedBindingKey: string;
}): { recover: boolean; attemptedBindingKey: string } {
  const code = chatSurfaceReplayErrorCode(input.cause);
  if (
    (code !== "seq_expired" && code !== "replay_required") ||
    input.attemptedBindingKey === input.bindingKey
  ) {
    return { recover: false, attemptedBindingKey: input.attemptedBindingKey };
  }
  return { recover: true, attemptedBindingKey: input.bindingKey };
}

function cloneReplayState(state: ReplayState): ReplayState {
  return {
    ...state,
    timelineNodes: new Map(state.timelineNodes),
    timelineOrder: state.timelineOrder.slice(),
    contentNodeById: new Map(state.contentNodeById),
    reasoningNodeById: new Map(state.reasoningNodeById),
    toolNodeById: new Map(state.toolNodeById),
    toolStates: new Map(state.toolStates),
    chatAgentById: new Map(state.chatAgentById),
    runAgentById: new Map(state.runAgentById),
    pendingAwaitings: state.pendingAwaitings.slice(),
    events: state.events.slice(),
    debugEvents: state.debugEvents.slice(),
    debugLines: state.debugLines.slice(),
    artifacts: state.artifacts.slice(),
    fileChanges: state.fileChanges.slice(),
    planRuntimeByTaskId: new Map(state.planRuntimeByTaskId),
    taskItemsById: new Map(state.taskItemsById),
    activeTaskIds: new Set(state.activeTaskIds),
  };
}

export function resolveChatSurfaceOwner(
  chat: Record<string, unknown>,
  activeRun: Record<string, unknown> | null,
): RunOwner | null {
  const activeOrLegacyOwner = toRunOwner({
    teamId: activeRun?.teamId || chat.teamId,
    agentKey:
      activeRun?.agentKey ||
      chat.firstAgentKey ||
      chat.agentKey,
  });
  if (activeOrLegacyOwner) return activeOrLegacyOwner;

  // Platform chat details keep completed-run ownership in runs[] rather than
  // repeating it on the chat object. Runs are ordered newest first.
  const runs = Array.isArray(chat.runs) ? chat.runs : [];
  for (const candidate of runs) {
    const owner = toRunOwner(objectRecord(candidate));
    if (owner) return owner;
  }
  return null;
}

export function useChatSurfaceReplay(input: {
  chatId: string;
  liveRole?: "overview" | "debug";
}): {
  status: ChatSurfaceReplayStatus;
  error: string;
  snapshot: ChatSurfaceReplaySnapshot | null;
  reload: () => void;
} {
  const chatId = String(input.chatId || "").trim();
  const runs = useRunTransport();
  const [status, setStatus] = useState<ChatSurfaceReplayStatus>("loading");
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<ChatSurfaceReplaySnapshot | null>(null);
  const [reloadRevision, setReloadRevision] = useState(0);
  const loadEpochRef = useRef(0);
  const bindingEpochRef = useRef(0);
  const recoveryGenerationRef = useRef(0);
  const attemptedRecoveryBindingRef = useRef("");
  const desktopSurfaceActiveRef = useRef<boolean | null>(null);
  const snapshotRef = useRef<ChatSurfaceReplaySnapshot | null>(null);
  snapshotRef.current = snapshot;

  const reloadSnapshot = useCallback(() => {
    setReloadRevision((revision) => revision + 1);
  }, []);

  const reload = useCallback(() => {
    recoveryGenerationRef.current += 1;
    attemptedRecoveryBindingRef.current = "";
    setError("");
    setStatus("loading");
    reloadSnapshot();
  }, [reloadSnapshot]);

  useEffect(() => {
    const epoch = ++loadEpochRef.current;
    if (!chatId) {
      setSnapshot(null);
      setStatus("error");
      setError("invalid_request");
      return;
    }
    setStatus("loading");
    setError("");
    void getChat(chatId, false)
      .then((response) => {
        if (loadEpochRef.current !== epoch) return;
        const chat = response.data as ChatDetailResponse & Record<string, unknown>;
        const replay = buildChatReplayProjection(chatId, chat);
        const activeRun = objectRecord(chat.activeRun);
        setSnapshot({
          chat,
          projection: replay.state,
          owner: resolveChatSurfaceOwner(chat, activeRun),
          activeRun,
        });
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        if (loadEpochRef.current !== epoch) return;
        setSnapshot(null);
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("error");
      });
    return () => {
      loadEpochRef.current += 1;
    };
  }, [chatId, reloadRevision]);

  useEffect(() => {
    if (!input.liveRole || !isDesktopAppMode()) return;
    desktopSurfaceActiveRef.current =
      typeof document !== "undefined" && document.visibilityState === "hidden"
        ? false
        : null;
    const handleSurfaceActive = (event: Event) => {
      const detail = (event as CustomEvent<DesktopLiveSurfaceActiveEventDetail>).detail;
      const active = detail?.active === true;
      if (shouldReloadChatSurfaceOnLifecycle(desktopSurfaceActiveRef.current, active)) reload();
      desktopSurfaceActiveRef.current = active;
    };
    window.addEventListener(DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, handleSurfaceActive);
    return () => {
      desktopSurfaceActiveRef.current = null;
      window.removeEventListener(DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, handleSurfaceActive);
    };
  }, [input.liveRole, reload]);

  useEffect(() => {
    if (
      !input.liveRole ||
      status !== "ready" ||
      !snapshot?.activeRun ||
      !snapshot.owner
    ) {
      return;
    }
    const runId = String(snapshot.activeRun.runId || "").trim();
    if (!runId) return;

    const epoch = ++bindingEpochRef.current;
    const recoveryBindingKey = [
      recoveryGenerationRef.current,
      chatId,
      runId,
    ].join(":");
    let lastSeq = Math.max(
      lastSeqForRun(snapshotRef.current?.projection.events || [], runId),
      normalizedSeq(snapshot.activeRun.lastSeq),
    );
    let recovering = false;
    let execution: RunExecution | null = null;
    const recover = (cause: unknown): boolean => {
      if (recovering) return false;
      const decision = decideChatSurfaceReplayRecovery({
        cause,
        bindingKey: recoveryBindingKey,
        attemptedBindingKey: attemptedRecoveryBindingRef.current,
      });
      if (!decision.recover) return false;
      recovering = true;
      attemptedRecoveryBindingRef.current = decision.attemptedBindingKey;
      void execution?.detach();
      setError("");
      setStatus("loading");
      reloadSnapshot();
      return true;
    };
    const reportError = (cause: unknown) => {
      const code = chatSurfaceReplayErrorCode(cause);
      setError(
        code === "seq_expired" || code === "replay_required"
          ? t("surface.replayExpired")
          : cause instanceof Error ? cause.message : String(cause),
      );
      setStatus("error");
    };
    execution = runs.subscribe({
      chatId,
      runId,
      owner: snapshot.owner,
      lastSeq,
      role: input.liveRole,
      onEvent: (event) => {
        if (bindingEpochRef.current !== epoch) return;
        const decision = classifyChatSurfaceEvent({ event, chatId, runId, lastSeq });
        if (decision.action === "ignore") return;
        if (decision.action === "reload") {
          recover(new RealtimeTransportError(
            "replay_required",
            `Run event gap detected after seq ${lastSeq}`,
            { retryable: true },
          ));
          return;
        }
        lastSeq = decision.nextSeq;
        setSnapshot((current) => {
          if (!current) return current;
          const projection = cloneReplayState(current.projection);
          replayEvent(projection, event);
          return { ...current, projection };
        });
      },
    });
    const activeExecution = execution;
    void activeExecution.identity.catch((cause: unknown) => {
      if (bindingEpochRef.current !== epoch) return;
      if (recover(cause)) return;
      reportError(cause);
    });
    void activeExecution.completion.then((completion) => {
      if (bindingEpochRef.current !== epoch || !completion.error) return;
      if (recover(completion.error)) return;
      reportError(completion.error);
    });
    return () => {
      bindingEpochRef.current += 1;
      void activeExecution.detach();
    };
  }, [
    chatId,
    input.liveRole,
    reloadSnapshot,
    runs,
    snapshot?.activeRun,
    snapshot?.owner,
    status,
  ]);

  return { status, error, snapshot, reload };
}
