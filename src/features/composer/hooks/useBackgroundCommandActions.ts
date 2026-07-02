import { useCallback, useRef, useState } from "react";
import type { Dispatch } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type {
  AIContextCompactEvent,
  AIUsageSnapshotEvent,
  AppState,
} from "@/app/state/types";
import { AIContextEventTypeEnum, AIUsageEventTypeEnum } from "@/app/state/types";
import {
  compactChat,
  createRequestId,
  learnChat,
  rememberChat,
  type CompactChatResponse,
} from "@/shared/data";
import { useI18n } from "@/shared/i18n";

export type BackgroundCommandType = "remember" | "learn" | "compact";

export interface BackgroundCommandTexts {
  pending: string;
  error: string;
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
  scheduleCommandStatusOverlayHide: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
  texts: BackgroundCommandTexts;
  usageSnapshot: AIUsageSnapshotEvent | null;
}

function compactTimelineText(
  data: CompactChatResponse,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (!data.accepted || data.status === "skipped") {
    return data.detail || t("contextCompact.noHistory");
  }
  const source =
    data.summarySource === "deterministic_fallback"
      ? t("contextCompact.source.deterministicFallback")
      : t("contextCompact.source.model");
  const parts = [
    t("contextCompact.completed"),
    t("contextCompact.summarySource", { source }),
  ];
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
  if (typeof data.compressionRatio === "number" && data.compressionRatio > 0) {
    parts.push(
      t("contextCompact.compressionRatio", {
        ratio: Math.round(data.compressionRatio * 100),
      }),
    );
  }
  return parts.join(" · ");
}

function readCompactNumber(value: unknown): number | null {
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
  if (!data.accepted || data.status === "skipped") {
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
    runId: previous?.runId || data.boundaryRunId || "",
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
  if (!data.accepted || data.status === "skipped") {
    return null;
  }
  return {
    type: AIContextEventTypeEnum.CompactComplete,
    requestId: data.requestId || requestId,
    chatId: data.chatId || chatId,
    runId: data.boundaryRunId,
    compactId: data.compactId,
    summarySource: data.summarySource,
    generation: data.generation,
    toolDigestCount: data.toolDigestCount,
    compactedRunCount: data.compactedRunCount,
    digestedRunIds: data.digestedRunIds,
    originalMessages: data.originalMessages,
    projectedMessages: data.projectedMessages,
    preCompactEstimatedTokens: data.preCompactEstimatedTokens,
    postCompactEstimatedTokens: data.postCompactEstimatedTokens,
    compressionRatio: data.compressionRatio,
    elapsedMs: data.elapsedMs,
    compactionUsage: data.compactionUsage as AIContextCompactEvent["compactionUsage"],
    cacheMetrics: data.cacheMetrics,
  };
}

function requestForCommand(commandType: BackgroundCommandType) {
  if (commandType === "remember") return rememberChat;
  if (commandType === "learn") return learnChat;
  return compactChat;
}

export async function runBackgroundCommand(
  input: RunBackgroundCommandInput,
): Promise<void> {
  const {
    chatId,
    commandType,
    dispatch,
    events,
    now = () => Date.now(),
    scheduleCommandStatusOverlayHide,
    t,
    texts,
    usageSnapshot,
  } = input;
  if (!chatId) {
    return;
  }

  const requestId = createRequestId(commandType);
  dispatch({
    type: "SHOW_COMMAND_STATUS_OVERLAY",
    commandType,
    phase: "pending",
    text: texts.pending,
  });

  try {
    const response = await requestForCommand(commandType)({
      requestId,
      chatId,
    });
    if (commandType === "compact" && response.data) {
      const compactData = response.data as CompactChatResponse;
      const compactEvent = buildCompactCompleteEvent(compactData, requestId, chatId);
      if (compactEvent) {
        dispatch({ type: "PUSH_EVENT", event: compactEvent });
      }
      const nextUsageSnapshot = buildCompactUsageSnapshot(
        compactData,
        usageSnapshot || latestUsageSnapshotFromEvents(events),
      );
      if (nextUsageSnapshot) {
        dispatch({ type: "SET_USAGE_SNAPSHOT", snapshot: nextUsageSnapshot });
      }
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
          ts: now(),
        },
      });
      dispatch({ type: "APPEND_TIMELINE_ORDER", id: nodeId });
    }
    dispatch({
      type: "APPEND_DEBUG",
      line: `[${commandType}] submitted for chatId=${chatId}, requestId=${requestId}`,
    });
    dispatch({
      type: "SHOW_COMMAND_STATUS_OVERLAY",
      commandType,
      phase: "success",
      text: texts.pending,
    });
  } catch (error) {
    dispatch({
      type: "APPEND_DEBUG",
      line: `[${commandType}] failed: ${(error as Error).message}`,
    });
    dispatch({
      type: "SHOW_COMMAND_STATUS_OVERLAY",
      commandType,
      phase: "error",
      text: texts.error,
    });
  } finally {
    scheduleCommandStatusOverlayHide();
  }
}

export function useBackgroundCommandActions(input: {
  dispatch: Dispatch<AppAction>;
  state: BackgroundCommandState;
  text: BackgroundCommandTextMap;
}) {
  const { dispatch, state, text } = input;
  const { t } = useI18n();
  const [submittingCommand, setSubmittingCommand] =
    useState<BackgroundCommandType | null>(null);
  const submittingCommandRef = useRef<BackgroundCommandType | null>(null);

  const scheduleCommandStatusOverlayHide = useCallback(() => {
    const timer = window.setTimeout(() => {
      dispatch({ type: "HIDE_COMMAND_STATUS_OVERLAY" });
    }, 2000);
    dispatch({
      type: "SET_COMMAND_STATUS_OVERLAY_TIMER",
      timer,
    });
  }, [dispatch]);

  const submitBackgroundCommand = useCallback(
    async (commandType: BackgroundCommandType) => {
      const chatId = String(state.chatId || "").trim();
      if (!chatId || submittingCommandRef.current) {
        return;
      }

      submittingCommandRef.current = commandType;
      setSubmittingCommand(commandType);
      try {
        await runBackgroundCommand({
          chatId,
          commandType,
          dispatch,
          events: state.events,
          scheduleCommandStatusOverlayHide,
          t,
          texts: text[commandType],
          usageSnapshot: state.usageSnapshot,
        });
      } finally {
        submittingCommandRef.current = null;
        setSubmittingCommand(null);
      }
    },
    [
      dispatch,
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
    submitCompactCommand: () => submitBackgroundCommand("compact"),
    submittingCommand,
  };
}
