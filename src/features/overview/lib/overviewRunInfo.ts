import type { AgentEvent, AIUsageSnapshotEvent } from "@/shared/contracts/agentEvents";
import type { Agent } from "@/features/agents/lib/agentState";
import type { Chat, CurrentChatActiveRun } from "@/features/chats/lib/chatState";
import type { ActiveAwaiting } from "@/features/tools/lib/toolsState";
import type { Team } from "@/features/workers/lib/workerState";
import { readEpochMillis } from "@/shared/utils/platformTime";

export interface OverviewRunInfoInput {
  chatId: string;
  runId: string;
  events: AgentEvent[];
  streaming: boolean;
  currentChatActiveRun: CurrentChatActiveRun | null;
  usageSnapshot?: AIUsageSnapshotEvent | null;
  runAgentById: Map<string, string>;
  activeAwaiting: ActiveAwaiting | null;
  chat?: Partial<Pick<Chat, "chatId" | "agentKey" | "firstAgentKey" | "firstAgentName" | "lastRunId" | "teamId" | "owner">>;
  agents?: Pick<Agent, "key" | "name">[];
  teams?: Pick<Team, "teamId" | "name">[];
}

export type OverviewRunStatus = "idle" | "starting" | "running" | "completed" | "cancelled" | "error" | "unknown" | "question" | "approval" | "form" | "plan";

export interface OverviewRunInfo {
  chatId: string;
  runId: string;
  agent: string;
  team: string;
  model: string;
  reasoning: string;
  status: OverviewRunStatus;
  active: boolean;
  startedAt?: number;
  finishedAt?: number;
  context: { current: number; max: number; percent: number } | null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

const terminalStatuses: Record<string, OverviewRunStatus> = {
  "run.complete": "completed",
  "run.cancel": "cancelled",
  "run.error": "error",
};

/** Only reported run data is used; composer choices describe the next query. */
export function buildOverviewRunInfo(input: OverviewRunInfoInput): OverviewRunInfo {
  const chatId = text(input.chatId);
  const chat = input.chat?.chatId === chatId ? input.chat : undefined;
  const activeRun = input.currentChatActiveRun?.chatId === chatId
    ? input.currentChatActiveRun : null;
  const events = chatId ? input.events.filter((event) => !event.chatId || event.chatId === chatId) : [];
  const lifecycle = events.filter((event) =>
    (event.type === "run.start" || terminalStatuses[event.type]) && !event.subAgentKey && !event.taskId,
  );
  const starting = Boolean(chatId && input.streaming && !input.runId && !activeRun?.runId);
  const runId = chatId && !starting
    ? text(activeRun?.runId) || text(input.runId) || text(lifecycle.at(-1)?.runId) || text(chat?.lastRunId)
    : "";
  const runEvents = runId ? events.filter((event) => event.runId === runId) : [];
  const runLifecycle = lifecycle.filter((event) => event.runId === runId);
  const start = runLifecycle.find((event) => event.type === "run.start");
  const terminal = runLifecycle.findLast((event) => Boolean(terminalStatuses[event.type]));
  const active = Boolean(runId && !terminal && (activeRun?.runId === runId || input.streaming));
  const awaiting = input.activeAwaiting?.runId === runId && !input.activeAwaiting.resolutionReason
    ? input.activeAwaiting : null;
  const status: OverviewRunStatus = terminal ? terminalStatuses[terminal.type]
    : active && awaiting ? awaiting.mode
      : active ? "running" : starting ? "starting" : runId ? "unknown" : "idle";
  const startedAt = readEpochMillis(start?.startedAt) || readEpochMillis(start?.timestamp)
    || (active ? readEpochMillis(activeRun?.startedAt) : undefined);
  const finishedAt = terminal
    ? readEpochMillis(terminal.finishedAt) || readEpochMillis(terminal.timestamp) : undefined;

  const usageEvents = runEvents.filter((event) => event.type === "usage.snapshot") as AIUsageSnapshotEvent[];
  const snapshot = input.usageSnapshot;
  if (snapshot && runId && snapshot.runId === runId && (!snapshot.chatId || snapshot.chatId === chatId)) {
    usageEvents.push(snapshot);
  }
  // A new run may not have reported usage yet. Never borrow the previous run's context/model.
  const usage = usageEvents.filter((event) =>
    !startedAt || !event.timestamp || event.timestamp >= startedAt,
  ).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).at(-1);
  const contextWindow = usage?.contextWindow;
  let current = number(contextWindow?.currentSize);
  const max = number(contextWindow?.maxSize);
  const compact = runEvents.findLast((event) => event.type === "context.compact.complete"
    && number(event.postCompactEstimatedTokens) !== null
    && (event.timestamp || 0) > (usage?.timestamp || 0));
  if (compact && usage) current = number(compact.postCompactEstimatedTokens);

  const owner = activeRun?.owner || chat?.owner;
  const teamId = owner?.kind === "orchestrated-team" ? owner.teamId : text(activeRun?.teamId) || text(chat?.teamId);
  const agentKey = text(activeRun?.agentKey) || text(input.runAgentById.get(runId))
    || text(runEvents.findLast((event) => event.agentKey && !event.subAgentKey && !event.taskId)?.agentKey)
    || (!runId && !teamId ? text(chat?.agentKey) || text(chat?.firstAgentKey) : "");

  return {
    chatId, runId, status, active, startedAt, finishedAt,
    agent: input.agents?.find((agent) => agent.key === agentKey)?.name
      || (agentKey && agentKey === chat?.firstAgentKey ? text(chat.firstAgentName) : "") || agentKey,
    team: input.teams?.find((team) => team.teamId === teamId)?.name || teamId,
    model: text(usage?.model?.key) || text(contextWindow?.modelKey) || text(usage?.usage?.current?.modelKey) || text(usage?.usage?.run?.modelKey),
    reasoning: text(contextWindow?.reasoningEffort),
    context: current !== null && max !== null && max > 0
      ? { current, max, percent: Math.round(current / max * 100) } : null,
  };
}

export function formatOverviewTime(timestamp: number | undefined, locale: string, now: number): { short: string; full: string } {
  if (!timestamp) return { short: "—", full: "" };
  const date = new Date(timestamp);
  const today = new Date(now);
  const sameDay = date.toDateString() === today.toDateString();
  return {
    short: date.toLocaleString(locale, {
      ...(sameDay ? {} : { year: "numeric", month: "2-digit", day: "2-digit" } as const),
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }),
    full: date.toLocaleString(locale, { hour12: false }),
  };
}
