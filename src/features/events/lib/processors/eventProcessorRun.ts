import type { AgentEvent, AIContextCompactEvent } from "@/shared/contracts/agentEvents";
import { readMustUseSkills, readRequestQueryText } from "@/features/events/lib/eventFields";
import type {
  EventCommand,
  EventProcessorConfig,
  EventProcessorState,
} from "@/features/events/lib/eventProcessorTypes";
import { normalizeTimelineAttachments } from "@/features/events/lib/timelineAttachments";
import { safeText, toText } from "@/shared/utils/eventUtils";
import { applyTaskBindingToNode } from "@/features/events/lib/processors/eventProcessorShared";
import { t } from "@/shared/i18n";
import { formatCompactStats } from "@/shared/utils/contextCompactStats";
import { formatPlatformErrorForDisplay } from "@/shared/data/errors/platformError";

export function processRunEvent(
  event: AgentEvent,
  state: EventProcessorState,
  config: EventProcessorConfig,
): EventCommand[] {
  const commands: EventCommand[] = [];
  const timestamp = event.timestamp ?? 0;
  const type = toText(event.type);

  if (type === "request.query") {
    if (config.mode !== "replay") return commands;
    const hidden = event.hidden === true ||
      (event.hidden === undefined && toText(event.role) === "automation");
    if (hidden) return commands;
    const text = readRequestQueryText(event);
    const attachments = normalizeTimelineAttachments(
      (event as Record<string, unknown>).references,
    );
    const mustUseSkills = readMustUseSkills(event);
    if (!text && attachments.length === 0) return commands;
    const counter = state.nextCounter();
    const suffix = toText(event.requestId) || String(counter);
    const taskBinding = applyTaskBindingToNode(event, state, undefined);
    commands.push({
      cmd: "USER_MESSAGE",
      nodeId: `user_${suffix}`,
      text,
      ts: timestamp,
      variant: "default",
      attachments: attachments.length > 0 ? attachments : undefined,
      mustUseSkills: mustUseSkills.length > 0 ? mustUseSkills : undefined,
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
    if (state.getTimelineNode(`${prefix}_${suffix}`)) return commands;
    if (event.chatId) commands.push({ cmd: "SET_CHAT_ID", chatId: event.chatId });
    if (event.runId) commands.push({ cmd: "SET_RUN_ID", runId: String(event.runId) });
    commands.push({
      cmd: "USER_MESSAGE",
      nodeId: `${prefix}_${suffix}`,
      text,
      ts: timestamp,
      variant,
      steerId: variant === "steer" ? toText(event.steerId) || suffix : undefined,
      attachments: normalizeTimelineAttachments((event as Record<string, unknown>).references),
    });
    return commands;
  }

  if (type === "context.compact.complete") {
    const compactId = toText(event.compactId) || String(config.mode === "replay" ? state.nextCounter() : Date.now());
    const nodeId = `compact_${compactId}`;
    if (state.getTimelineNode(nodeId)) return commands;
    const source = toText(event.summarySource) || "unknown";
    const level = toText(event.level) || "summary";
    const digestCount = Number((event as Record<string, unknown>).toolDigestCount ?? 0);
    const originalMessages = Number((event as Record<string, unknown>).originalMessages ?? 0);
    const textParts = [
      level === "l1_tools"
        ? t("contextCompact.toolsCompleted")
        : t("contextCompact.summaryCompleted"),
    ];
    if (level === "summary") {
      textParts.push(t("contextCompact.summarySource", {
        source:
          source === "deterministic_fallback"
            ? t("contextCompact.source.deterministicFallback")
            : t("contextCompact.source.model"),
      }));
    }
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
    const stats = formatCompactStats(event as AIContextCompactEvent, t);
    textParts.push(...stats);
    commands.push({
      cmd: "SYSTEM_MESSAGE",
      nodeId,
      text: textParts.join(" · "),
      ...(stats.length > 0
        ? { tooltip: t("contextCompact.reductionTooltip") }
        : {}),
      ts: timestamp,
    });
    return commands;
  }

  if (type === "context.compact.failed") {
    const compactId = toText(event.compactId) || String(config.mode === "replay" ? state.nextCounter() : Date.now());
    const nodeId = `compact_failed_${compactId}`;
    if (state.getTimelineNode(nodeId)) return commands;
    commands.push({
      cmd: "SYSTEM_ERROR",
      nodeId,
      text: t("contextCompact.failed", {
        detail:
          (event.detail === "summary_input_too_large"
            ? t("contextCompact.summaryInputTooLargeDetail")
            : safeText((event as Record<string, unknown>).detail)) ||
          safeText((event as Record<string, unknown>).error) ||
          t("contextCompact.unknownError"),
      }),
      ts: timestamp,
    });
    return commands;
  }

  if (type === "context.compact.start") {
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
        ts: timestamp,
      });
    }
    return commands;
  }

  return commands;
}
