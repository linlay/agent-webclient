import type { AgentEvent } from "@/app/state/types";
import { readRequestQueryText } from "@/shared/utils/eventFieldReaders";
import type {
  EventCommand,
  EventProcessorConfig,
  EventProcessorState,
} from "@/features/timeline/lib/eventProcessorTypes";
import { normalizeTimelineAttachments } from "@/features/artifacts/lib/timelineAttachments";
import { safeText, toText } from "@/shared/utils/eventUtils";
import { applyTaskBindingToNode } from "@/features/timeline/lib/eventProcessorShared";
import { t } from "@/shared/i18n";
import { formatPlatformErrorForDisplay } from "@/shared/api/platformError";

export function processRunEvent(
  event: AgentEvent,
  state: EventProcessorState,
  config: EventProcessorConfig,
): EventCommand[] {
  const commands: EventCommand[] = [];
  const type = toText(event.type);

  if (type === "request.query") {
    if (config.mode !== "replay") return commands;
    const text = readRequestQueryText(event);
    const attachments = normalizeTimelineAttachments(
      (event as Record<string, unknown>).references,
    );
    if (!text && attachments.length === 0) return commands;
    const counter = state.nextCounter();
    const suffix = toText(event.requestId) || String(counter);
    const taskBinding = applyTaskBindingToNode(event, state, undefined);
    commands.push({
      cmd: "USER_MESSAGE",
      nodeId: `user_${suffix}`,
      text,
      ts: event.timestamp || Date.now(),
      variant: "default",
      attachments: attachments.length > 0 ? attachments : undefined,
      ...(taskBinding.taskId ? taskBinding : {}),
    });
    return commands;
  }

  if (type === "request.steer") {
    const text = safeText(event.message);
    if (!text) return commands;
    const counter = config.mode === "replay" ? state.nextCounter() : null;
    const variant = "steer";
    const prefix = "steer";
    const suffix =
      toText(event.steerId) || toText(event.requestId) || String(counter ?? Date.now());
    if (event.chatId) commands.push({ cmd: "SET_CHAT_ID", chatId: event.chatId });
    if (event.runId) commands.push({ cmd: "SET_RUN_ID", runId: String(event.runId) });
    commands.push({
      cmd: "USER_MESSAGE",
      nodeId: `${prefix}_${suffix}`,
      text,
      ts: event.timestamp || Date.now(),
      variant,
      steerId: variant === "steer" ? toText(event.steerId) || suffix : undefined,
    });
    return commands;
  }

  if (type === "context.compact.complete") {
    const compactId = toText(event.compactId) || String(config.mode === "replay" ? state.nextCounter() : Date.now());
    const source = toText(event.summarySource) || "unknown";
    const digestCount = Number((event as Record<string, unknown>).toolDigestCount ?? 0);
    const originalMessages = Number((event as Record<string, unknown>).originalMessages ?? 0);
    const compressionRatio = Number((event as Record<string, unknown>).compressionRatio ?? 0);
    const textParts = [
      t("contextCompact.completed"),
      t("contextCompact.summarySource", {
        source:
          source === "deterministic_fallback"
            ? t("contextCompact.source.deterministicFallback")
            : t("contextCompact.source.model"),
      }),
    ];
    if (Number.isFinite(originalMessages) && originalMessages > 0) {
      textParts.push(
        t("contextCompact.originalMessages", { count: originalMessages }),
      );
    }
    if (Number.isFinite(digestCount) && digestCount > 0) {
      textParts.push(
        t("contextCompact.toolDigestCount", { count: digestCount }),
      );
    }
    if (Number.isFinite(compressionRatio) && compressionRatio > 0) {
      textParts.push(
        t("contextCompact.compressionRatio", {
          ratio: Math.round(compressionRatio * 100),
        }),
      );
    }
    commands.push({
      cmd: "SYSTEM_MESSAGE",
      nodeId: `compact_${compactId}`,
      text: textParts.join(" · "),
      ts: event.timestamp || Date.now(),
    });
    return commands;
  }

  if (type === "context.compact.failed") {
    commands.push({
      cmd: "SYSTEM_ERROR",
      nodeId: `compact_failed_${config.mode === "replay" ? state.nextCounter() : Date.now()}`,
      text: t("contextCompact.failed", {
        detail:
          safeText((event as Record<string, unknown>).error) ||
          t("contextCompact.unknownError"),
      }),
      ts: event.timestamp || Date.now(),
    });
    return commands;
  }

  if (type === "run.start") {
    if (event.runId) commands.push({ cmd: "SET_RUN_ID", runId: event.runId });
    if (event.chatId) commands.push({ cmd: "SET_CHAT_ID", chatId: event.chatId });
    if (event.agentKey && (event.chatId || state.chatId)) {
      commands.push({
        cmd: "SET_CHAT_AGENT",
        chatId: event.chatId || state.chatId,
        agentKey: String(event.agentKey),
      });
    }
    return commands;
  }

  if (type === "run.error" || type === "run.complete" || type === "run.cancel") {
    if (type === "run.error" && event.error) {
      const display = formatPlatformErrorForDisplay(event);
      commands.push({
        cmd: "SYSTEM_ERROR",
        nodeId: `sys_${config.mode === "replay" ? state.nextCounter() : Date.now()}`,
        text: display.message,
        errorDetail: display.error,
        ts: event.timestamp || Date.now(),
      });
    }
    return commands;
  }

  return commands;
}
