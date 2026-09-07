import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { AIContextCompactEvent, AIUsageSnapshotEvent } from "@/shared/contracts/agentEvents";
import type { AppState } from "@/app/state/AppContext";
import { AIContextEventTypeEnum, AIUsageEventTypeEnum } from "@/shared/contracts/agentEvents";
import {
  compactChat,
  createRequestId,
  learnChat,
  rememberChat,
  type CompactChatResponse,
  type CompactLevel,
} from "@/shared/data";
import { resolveCompactPhase } from "@/features/runs/lib/contextCompact";
import { useI18n } from "@/shared/i18n";
import { formatCompactStats } from "@/shared/utils/contextCompactStats";

export type BackgroundCommandType = "remember" | "learn" | "compact";

export interface BackgroundCommandTexts {
  pending: string;
  error: string;
  waiting?: string;
  compacting?: string;
  toolsCompacting?: string;
  summaryCompacting?: string;
}

export interface BackgroundCommandTextMap {
  remember: BackgroundCommandTexts;
  learn: BackgroundCommandTexts;
  compact: BackgroundCommandTexts;
}

interface BackgroundCommandState {
  chatId: AppState["chatId"];
  events: AppState["events"];
  usageSnapshot: AppState["usageSnapshot"];
}

interface RunBackgroundCommandInput {
  chatId: string;
  commandType: BackgroundCommandType;
  dispatch: Dispatch<AppAction>;
  events: AppState["events"];
  now?: () => number;
  requestId?: string;
  getEvents?: () => AppState["events"];
  isCurrentChat?: () => boolean;
  scheduleCommandStatusOverlayHide: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
  texts: BackgroundCommandTexts;
  usageSnapshot: AIUsageSnapshotEvent | null;
  compactLevel?: CompactLevel;
}

function isCompactCompleted(data: CompactChatResponse): boolean {
  return data.accepted === true && data.status === "completed";
}

function isCompactNoHistory(data: CompactChatResponse): boolean {
  return (
    data.accepted === false &&
    data.status === "skipped" &&
    (["no_compactable_history", "no_compactable_tools", "already_at_target"].includes(data.detail || ""))
  );
}

export function compactFailureText(
  data: CompactChatResponse,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (data.detail === "history_changed") {
    return t("contextCompact.historyChanged");
  }
  if (data.detail === "run_interrupted") {
    return t("contextCompact.runInterrupted");
  }
  if (data.detail === "unsupported_active_run") {
    return t("contextCompact.unsupportedActiveRun");
  }
  if (data.detail === "compact_in_progress") {
    return t("contextCompact.compactInProgress");
  }
  if (data.detail === "summary_input_too_large") {
    return t("contextCompact.summaryInputTooLarge");
  }
  if (data.detail === "summary_model_failed" || data.detail === "summary_empty") {
    return t("contextCompact.summaryFailed");
  }
  return t("contextCompact.failed", {
    detail: data.detail || data.status || t("contextCompact.unknownError"),
  });
}

function compactSkippedText(
  data: CompactChatResponse,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  return data.detail === "no_compactable_tools"
    ? t("contextCompact.noTools")
    : t("contextCompact.noHistory");
}

function compactTimelineText(
  data: CompactChatResponse,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const level = data.level || "summary";
  const source =
    data.summarySource === "deterministic_fallback"
      ? t("contextCompact.source.deterministicFallback")
      : t("contextCompact.source.model");
  const parts = [
    level === "l1_tools"
      ? t("contextCompact.toolsCompleted")
      : t("contextCompact.summaryCompleted"),
  ];
  if (level === "summary") {
    parts.push(t("contextCompact.summarySource", { source }));
  }
  if (typeof data.originalMessages === "number" && data.originalMessages > 0) {
    parts.push(
      t("contextCompact.originalMessages", { count: data.originalMessages }),
    );
  }
  if (typeof data.toolDigestCount === "number" && data.toolDigestCount > 0) {
    parts.push(
      t("contextCompact.toolDigestCount", { count: data.toolDigestCount }),
    );
  }
  parts.push(...formatCompactStats(data, t));
  return parts.join(" · ");
}

function readCompactNumber(value: unknown): number | null {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function latestUsageSnapshotFromEvents(
  events: readonly unknown[],
): AIUsageSnapshotEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!isObjectRecord(event) || event.type !== AIUsageEventTypeEnum.Snapshot) {
      continue;
    }
    const snapshot = event as unknown as AIUsageSnapshotEvent;
    if (snapshot.contextWindow || snapshot.usage) {
      return snapshot;
    }
  }
  return null;
}

export function buildCompactUsageSnapshot(
  data: CompactChatResponse,
  previous: AIUsageSnapshotEvent | null,
): AIUsageSnapshotEvent | null {
  if (!isCompactCompleted(data)) {
    return null;
  }
  const currentSize = readCompactNumber(data.postCompactEstimatedTokens);
  if (currentSize == null) {
    return null;
  }
  const previousContext = previous?.contextWindow || {};
  return {
    type: AIUsageEventTypeEnum.Snapshot,
    chatId: data.chatId || previous?.chatId || "",
    runId: data.runId || previous?.runId || data.boundaryRunId || "",
    ...(previous?.model ? { model: previous.model } : {}),
    contextWindow: {
      ...previousContext,
      currentSize,
      estimatedNextCallSize: currentSize,
    },
    ...(previous?.usage ? { usage: previous.usage } : {}),
  };
}

function buildCompactCompleteEvent(
  data: CompactChatResponse,
  requestId: string,
  chatId: string,
): AIContextCompactEvent | null {
  if (!isCompactCompleted(data)) {
    return null;
  }
  return {
    type: AIContextEventTypeEnum.CompactComplete,
    requestId: data.requestId || requestId,
    chatId: data.chatId || chatId,
    runId: data.runId || data.boundaryRunId,
    compactId: data.compactId,
    cycleId: data.cycleId,
    cycleComplete: data.cycleComplete,
    trigger: data.trigger,
    scope: data.scope,
    retryable: data.retryable,
    detail: data.detail,
    level: data.level,
    summarySource: data.summarySource,
    toolsCleared: data.toolsCleared,
    toolsKept: data.toolsKept,
    tokensFreed: data.tokensFreed,
    generation: data.generation,
    toolDigestCount: data.toolDigestCount,
    compactedRunCount: data.compactedRunCount,
    digestedRunIds: data.digestedRunIds,
    originalMessages: data.originalMessages,
    projectedMessages: data.projectedMessages,
    preCompactEstimatedTokens: data.preCompactEstimatedTokens,
    postCompactEstimatedTokens: data.postCompactEstimatedTokens,
    compressionRatio: data.compressionRatio,
    remainingRatio: data.remainingRatio,
    releasedRatio: data.releasedRatio,
    elapsedMs: data.elapsedMs,
    compactionUsage: data.compactionUsage as AIContextCompactEvent["compactionUsage"],
    cacheMetrics: data.cacheMetrics,
  };
}

function hasMatchingCompactEvent(
  events: readonly unknown[],
  data: CompactChatResponse,
  requestId: string,
  type: string,
): boolean {
  return events.some((event) => {
    if (!isObjectRecord(event) || event.type !== type) return false;
    if (data.compactId && event.compactId === data.compactId) return true;
    return event.requestId === (data.requestId || requestId);
  });
}

export async function runBackgroundCommand(
  input: RunBackgroundCommandInput,
): Promise<void> {
  const {
    chatId,
    commandType,
    dispatch,
    events,
    getEvents,
    now = () => Date.now(),
    requestId: providedRequestId,
    scheduleCommandStatusOverlayHide,
    t,
    texts,
    usageSnapshot,
    compactLevel = "summary",
  } = input;
  if (!chatId) {
    return;
  }

  const showOutcome = (phase: "success" | "error", message: string, compactData?: CompactChatResponse) => {
    const active = commandType === "compact" ? resolveCompactPhase(getEvents?.() || events, chatId) : null;
    const sameCycle = active && [compactData?.cycleId, compactData?.compactId, compactData?.requestId].includes(active.cycleId);
    // The run may already have entered an independent automatic cycle while
    // this manual API response was in transit. Do not hide its blocking phase.
    if (active && !sameCycle) {
      dispatch({
        type: "SHOW_COMMAND_STATUS_OVERLAY", commandType, phase: "pending",
        text: active.level === "l1_tools"
          ? texts.toolsCompacting || texts.pending
          : texts.summaryCompacting || texts.pending,
      });
      return;
    }
    dispatch({ type: "SHOW_COMMAND_STATUS_OVERLAY", commandType, phase, text: message });
  };

  const requestId = providedRequestId || createRequestId(commandType);
  dispatch({
    type: "SHOW_COMMAND_STATUS_OVERLAY",
    commandType,
    phase: "pending",
    text:
      commandType === "compact"
        ? texts.waiting || texts.pending
        : texts.pending,
  });

  try {
    const response = commandType === "compact"
      ? await compactChat({ requestId, chatId, level: compactLevel })
      : commandType === "remember"
        ? await rememberChat({ requestId, chatId })
        : await learnChat({ requestId, chatId });
    if (input.isCurrentChat && !input.isCurrentChat()) return;
    let successText = texts.pending;
    let completedCompact: CompactChatResponse | undefined;
    if (commandType === "compact") {
      if (!response.data) {
        throw new Error("compact response data is missing");
      }
      const compactData = response.data as CompactChatResponse;
      completedCompact = compactData;
      const completed = isCompactCompleted(compactData);
      const noHistory = isCompactNoHistory(compactData);
      if (!completed && !noHistory) {
        const failureText = compactFailureText(compactData, t);
        dispatch({
          type: "APPEND_DEBUG",
          line: `[compact] rejected: ${compactData.detail || compactData.status || "unknown"}`,
        });
        showOutcome("error", failureText, compactData);
        return;
      }
      const currentEvents = getEvents?.() || events;
      const completeEventReceived = hasMatchingCompactEvent(
        currentEvents,
        compactData,
        requestId,
        AIContextEventTypeEnum.CompactComplete,
      );
      if (completed && !completeEventReceived) {
        const compactEvent = buildCompactCompleteEvent(compactData, requestId, chatId);
        if (compactEvent && !completeEventReceived) {
          dispatch({ type: "PUSH_EVENT", event: compactEvent });
        }
        const nextUsageSnapshot = buildCompactUsageSnapshot(
          compactData,
          latestUsageSnapshotFromEvents(currentEvents) || usageSnapshot,
        );
        const newerUsageArrived = currentEvents.slice(events.length).some((event) => event.type === "usage.snapshot" || event.type === "context.compact.complete");
        if (nextUsageSnapshot && !newerUsageArrived) {
          dispatch({ type: "SET_USAGE_SNAPSHOT", snapshot: nextUsageSnapshot });
        }
      }
      if (completed && !completeEventReceived) {
        const nodeId = `compact_${compactData.compactId || requestId}`;
        const text = compactTimelineText(compactData, t);
        dispatch({
          type: "SET_TIMELINE_NODE",
          id: nodeId,
          node: {
            id: nodeId,
            kind: "message",
            role: "system",
            messageVariant: "compact",
            text,
            tooltip: t("contextCompact.reductionTooltip"),
            ts: now(),
          },
        });
        dispatch({ type: "APPEND_TIMELINE_ORDER", id: nodeId });
      }
      successText = completed
        ? t("contextCompact.completed")
        : compactSkippedText(compactData, t);
    }
    dispatch({
      type: "APPEND_DEBUG",
      line: `[${commandType}] submitted for chatId=${chatId}, requestId=${requestId}`,
    });
    showOutcome("success", successText, completedCompact);
  } catch (error) {
    if (input.isCurrentChat && !input.isCurrentChat()) return;
    dispatch({
      type: "APPEND_DEBUG",
      line: `[${commandType}] failed: ${(error as Error).message}`,
    });
    showOutcome("error", texts.error);
  } finally {
    if (!input.isCurrentChat || input.isCurrentChat()) scheduleCommandStatusOverlayHide();
  }
}

const pendingCompactChats = new Set<string>();

export function useBackgroundCommandActions(input: {
  dispatch: Dispatch<AppAction>;
  state: BackgroundCommandState;
  text: BackgroundCommandTextMap;
  canCompact?: boolean;
}) {
  const { dispatch, state, text } = input;
  const chatRef = useRef(state.chatId);
  chatRef.current = state.chatId;
  const phase = resolveCompactPhase(state.events, String(state.chatId || ""));
  const phaseKey = phase ? `${phase.chatId}:${phase.runId}:${phase.cycleId}:${phase.level}` : "";
  const { t } = useI18n();
  const [submittingCommand, setSubmittingCommand] =
    useState<BackgroundCommandType | null>(null);
  const submittingCommandRef = useRef<BackgroundCommandType | null>(null);
  const activeCompactRequestIdRef = useRef("");
  const eventsRef = useRef(state.events);
  eventsRef.current = state.events;

  useEffect(() => {
    if (!phase) return;
    dispatch({
      type: "SHOW_COMMAND_STATUS_OVERLAY", commandType: "compact", phase: "pending",
      text: phase.level === "l1_tools"
        ? text.compact.toolsCompacting || text.compact.pending
        : text.compact.summaryCompacting || text.compact.pending,
    });
  }, [dispatch, phaseKey, text.compact.toolsCompacting, text.compact.summaryCompacting, text.compact.pending]);
  const previousPhaseRef = useRef("");
  useEffect(() => {
    if (previousPhaseRef.current && !phaseKey && submittingCommand !== "compact") {
      dispatch({ type: "HIDE_COMMAND_STATUS_OVERLAY" });
    }
    previousPhaseRef.current = phaseKey;
  }, [dispatch, phaseKey, submittingCommand]);

  const scheduleCommandStatusOverlayHide = useCallback(() => {
    const scheduledChat = chatRef.current;
    const timer = window.setTimeout(() => {
      if (chatRef.current !== scheduledChat || resolveCompactPhase(eventsRef.current, String(chatRef.current || ""))) return;
      dispatch({ type: "HIDE_COMMAND_STATUS_OVERLAY" });
    }, 2000);
    dispatch({
      type: "SET_COMMAND_STATUS_OVERLAY_TIMER",
      timer,
    });
  }, [dispatch]);

  const submitBackgroundCommand = useCallback(
    async (commandType: BackgroundCommandType, compactLevel: CompactLevel = "summary") => {
      const chatId = String(state.chatId || "").trim();
      if (!chatId || submittingCommandRef.current) {
        return;
      }

      if (commandType === "compact" && (input.canCompact === false || phase || pendingCompactChats.has(chatId))) {
        return;
      }

      submittingCommandRef.current = commandType;
      setSubmittingCommand(commandType);
      const requestId = createRequestId(commandType);
      if (commandType === "compact") {
        pendingCompactChats.add(chatId);
        activeCompactRequestIdRef.current = requestId;
      }
      try {
        await runBackgroundCommand({
          chatId,
          commandType,
          dispatch,
          events: state.events,
          getEvents: () => eventsRef.current,
          isCurrentChat: () => chatRef.current === chatId,
          requestId,
          scheduleCommandStatusOverlayHide,
          t,
          texts: text[commandType],
          usageSnapshot: state.usageSnapshot,
          compactLevel,
        });
      } finally {
        if (commandType === "compact") {
          pendingCompactChats.delete(chatId);
          activeCompactRequestIdRef.current = "";
        }
        submittingCommandRef.current = null;
        setSubmittingCommand(null);
      }
    },
    [
      dispatch,
      input.canCompact,
      phaseKey,
      scheduleCommandStatusOverlayHide,
      state.chatId,
      state.events,
      state.usageSnapshot,
      t,
      text,
    ],
  );

  return {
    submitBackgroundCommand,
    submitRememberCommand: () => submitBackgroundCommand("remember"),
    submitLearnCommand: () => submitBackgroundCommand("learn"),
    submitCompactCommand: (level: CompactLevel = "summary") => submitBackgroundCommand("compact", level),
    submittingCommand,
  };
}
