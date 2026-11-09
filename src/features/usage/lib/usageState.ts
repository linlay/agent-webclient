import type { AIUsageSnapshotEvent, AIUsageStats, AIVoiceUsage } from "@/shared/contracts/agentEvents";

export interface UsageState {
  usageSnapshot: AIUsageSnapshotEvent | null;
  usagePopoverOpen: boolean;
  usageRefreshFailed?: boolean;
}

export type UsageAction =
  | { type: "SET_USAGE_SNAPSHOT"; snapshot: AIUsageSnapshotEvent | null }
  | { type: "SET_USAGE_PROJECTION"; snapshot: AIUsageSnapshotEvent }
  | { type: "SET_USAGE_REFRESH_FAILED"; failed: boolean }
  | { type: "SET_USAGE_POPOVER_OPEN"; open: boolean };
export function createInitialUsageState(): UsageState { return { usageSnapshot: null, usagePopoverOpen: false }; }

// Runtime snapshots contain the model/tool base. Retain only server-projected
// voice totals; never infer quantities or calculate prices in the client.
function withVoice(base: AIUsageStats | undefined, voice: AIVoiceUsage | undefined): AIUsageStats | undefined {
  if (!voice) return base;
  const oldCost = base?.estimatedCost;
  const voiceCost = voice.estimatedCost;
  if (oldCost?.currency && voiceCost?.currency && oldCost.currency !== voiceCost.currency) {
    throw new Error("voice cost currency mismatch");
  }
  const cost = oldCost || voiceCost ? {
    ...oldCost,
    currency: oldCost?.currency || voiceCost?.currency,
    total: (oldCost?.total ?? 0) - (base?.voice?.estimatedCost?.total ?? 0) + (voiceCost?.total ?? 0),
  } : undefined;
  return { ...base, voice, ...(cost ? { estimatedCost: cost } : {}) };
}
export function reduceUsageState<S extends UsageState>(state: S, action: UsageAction): S;
export function reduceUsageState<S extends UsageState>(state: S, action: { type: string }): S | null;
export function reduceUsageState<S extends UsageState>(state: S, input: { type: string }): S | null {
  const action = input as UsageAction;
  switch (action.type) {
    case "SET_USAGE_REFRESH_FAILED":
      return { ...state, usageRefreshFailed: action.failed };
    case "SET_USAGE_SNAPSHOT":
    case "SET_USAGE_PROJECTION": {
      const next = action.snapshot;
      const previous = state.usageSnapshot;
      if (!next) return { ...state, usageSnapshot: null, usageRefreshFailed: false };
      if (!previous || previous.chatId !== next.chatId) return { ...state, usageSnapshot: next, usageRefreshFailed: false };
      const projection = action.type === "SET_USAGE_PROJECTION";
      if (!projection && !previous.usage?.chat?.voice && !previous.usage?.run?.voice) return { ...state, usageSnapshot: next };
      const sameRun = previous.runId === next.runId;
      try {
        if (projection) {
          // Refresh cost without replacing live context, counters or Run identity.
          const nextChat = next.usage?.chat;
          const currentChat = previous.usage?.chat;
          const chat = (currentChat?.totalTokens ?? 0) > (nextChat?.totalTokens ?? 0)
            ? withVoice(currentChat, nextChat?.voice) : nextChat;
          return { ...state, usageRefreshFailed: false, usageSnapshot: { ...previous, usage: {
            ...previous.usage, ...(chat ? { chat } : {}),
            ...(sameRun && next.usage?.run?.voice ? { run: withVoice(previous.usage?.run, next.usage.run.voice) } : {}),
          } } };
        }
        return { ...state, usageSnapshot: { ...next, usage: {
          ...next.usage,
          chat: next.usage?.chat?.voice ? next.usage.chat : withVoice(next.usage?.chat, previous.usage?.chat?.voice),
          run: next.usage?.run?.voice || !sameRun ? next.usage?.run : withVoice(next.usage?.run, previous.usage?.run?.voice),
        } } };
      } catch {
        return { ...state, usageSnapshot: next, usageRefreshFailed: true };
      }
    }
    case "SET_USAGE_POPOVER_OPEN":
      return { ...state, usagePopoverOpen: action.open };
    default: return null;
  }
}
