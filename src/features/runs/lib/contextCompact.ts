import type { AgentEvent, AIContextCompactEvent } from "@/shared/contracts/agentEvents";

export interface CompactPhase {
  chatId: string;
  runId: string;
  cycleId: string;
  level: "l1_tools" | "summary";
}

// Replay and live events use the same ordered state machine. Each cycle stays
// pending between L1 completion and L2 start, and terminal runs clear it.
export function resolveCompactPhase(events: readonly AgentEvent[], chatId: string): CompactPhase | null {
  const pending = new Map<string, CompactPhase>();
  const completed = new Set<string>();
  const seenStages = new Set<string>();
  const terminalRuns = new Set<string>();
  for (const event of events) {
    if (event.chatId && event.chatId !== chatId) continue;
    const runId = String(event.runId || "");
    if (["run.complete", "run.cancel", "run.error"].includes(event.type)) {
      terminalRuns.add(runId);
      for (const [key, phase] of pending) if (phase.runId === runId) { pending.delete(key); completed.add(key); }
      continue;
    }
    if (!event.type.startsWith("context.compact.")) continue;
    const compact = event as AIContextCompactEvent;
    if (runId && terminalRuns.has(runId) && compact.scope !== "history") continue;
    const cycleId = compact.cycleId || compact.compactId || compact.requestId || "";
    const key = `${chatId}:${runId}:${cycleId}`;
    if (completed.has(key)) continue;
    const stage = `${key}:${compact.compactId || compact.requestId || compact.level}:${event.type}`;
    if (seenStages.has(stage)) continue;
    seenStages.add(stage);
    if (event.type === "context.compact.failed" || (event.type === "context.compact.complete" && compact.cycleComplete !== false)) {
      pending.delete(key);
      completed.add(key);
    } else {
      pending.set(key, { chatId, runId, cycleId, level: event.type === "context.compact.complete" ? "summary" : compact.level || "summary" });
    }
  }
  return [...pending.values()].pop() || null;
}

export function canSubmitCompact(chatId: string, running: boolean, supported: boolean, pending: boolean): boolean {
  return Boolean(chatId.trim()) && (!running || supported) && !pending;
}
