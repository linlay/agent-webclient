import type { AgentEvent } from "@/app/state/types";
import type {
  EventCommand,
  EventProcessorConfig,
  EventProcessorState,
} from "@/features/timeline/lib/eventProcessorTypes";
import { normalizeTimelineAttachments } from "@/features/artifacts/lib/timelineAttachments";
import { safeText, toText } from "@/shared/utils/eventUtils";

export function processRunEvent(
  event: AgentEvent,
  state: EventProcessorState,
  config: EventProcessorConfig,
): EventCommand[] {
  const commands: EventCommand[] = [];
  const type = toText(event.type);

  if (type === "request.query") {
    if (config.mode !== "replay") return commands;
    const text = safeText(event.message);
    const attachments = normalizeTimelineAttachments(
      (event as Record<string, unknown>).references,
    );
    if (!text && attachments.length === 0) return commands;
    const counter = state.nextCounter();
    const suffix = toText(event.requestId) || String(counter);
    commands.push({
      cmd: "USER_MESSAGE",
      nodeId: `user_${suffix}`,
      text,
      ts: event.timestamp || Date.now(),
      variant: "default",
      attachments: attachments.length > 0 ? attachments : undefined,
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
      commands.push({
        cmd: "SYSTEM_ERROR",
        nodeId: `sys_${config.mode === "replay" ? state.nextCounter() : Date.now()}`,
        text: safeText(event.error),
        ts: Date.now(),
      });
    }
    return commands;
  }

  return commands;
}

