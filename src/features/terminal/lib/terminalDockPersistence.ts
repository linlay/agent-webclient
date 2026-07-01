import { toText } from "@/shared/utils/eventUtils";

const DOCK_STATE_STORAGE_PREFIX = "agent-webclient.terminalDockState.v1:";
const DOCK_OPEN_STORAGE_KEY = "agent-webclient.terminalDockOpen.v1";

export type TerminalDockTabState = {
  readonly id: string;
  readonly label: string;
  readonly terminalKey: string;
};

export type TerminalDockStoredState = {
  readonly tabs: readonly TerminalDockTabState[];
  readonly activeTabId: string;
  readonly nextIndex: number;
};

const terminalDockStateByAgentKey = new Map<string, TerminalDockStoredState>();

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function dockStateStorageKey(agentKey: string): string {
  return `${DOCK_STATE_STORAGE_PREFIX}${encodeURIComponent(agentKey)}`;
}

function normalizeTab(value: unknown): TerminalDockTabState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = toText(record.id);
  const terminalKey = toText(record.terminalKey);
  if (!id || !terminalKey) {
    return null;
  }
  return {
    id,
    label: toText(record.label) || "终端",
    terminalKey,
  };
}

function normalizeDockState(value: unknown): TerminalDockStoredState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const tabs = Array.isArray(record.tabs)
    ? record.tabs.map(normalizeTab).filter((tab): tab is TerminalDockTabState => Boolean(tab))
    : [];
  const activeTabId = toText(record.activeTabId);
  const safeActiveTabId = tabs.some((tab) => tab.id === activeTabId)
    ? activeTabId
    : tabs[0]?.id || "";
  const nextIndex = Number(record.nextIndex);
  return {
    tabs,
    activeTabId: safeActiveTabId,
    nextIndex: Number.isFinite(nextIndex) && nextIndex >= 0 ? nextIndex : tabs.length,
  };
}

export function restoreTerminalDockState(
  agentKey: string,
  fallback: TerminalDockStoredState,
): TerminalDockStoredState {
  const normalizedAgentKey = toText(agentKey);
  if (!normalizedAgentKey) {
    return fallback;
  }
  const cached = terminalDockStateByAgentKey.get(normalizedAgentKey);
  if (cached) {
    return cached;
  }
  const storage = getStorage();
  const raw = storage?.getItem(dockStateStorageKey(normalizedAgentKey));
  if (!raw) {
    return fallback;
  }
  try {
    const restored = normalizeDockState(JSON.parse(raw));
    if (restored) {
      terminalDockStateByAgentKey.set(normalizedAgentKey, restored);
      return restored;
    }
  } catch {
    storage?.removeItem(dockStateStorageKey(normalizedAgentKey));
  }
  return fallback;
}

export function persistTerminalDockState(
  agentKey: string,
  state: TerminalDockStoredState,
): void {
  const normalizedAgentKey = toText(agentKey);
  if (!normalizedAgentKey) {
    return;
  }
  terminalDockStateByAgentKey.set(normalizedAgentKey, state);
  try {
    getStorage()?.setItem(
      dockStateStorageKey(normalizedAgentKey),
      JSON.stringify(state),
    );
  } catch {
    // In-memory state still preserves SPA agent switching.
  }
}

export function restoreTerminalDockOpen(): boolean {
  const value = getStorage()?.getItem(DOCK_OPEN_STORAGE_KEY);
  return value === "1";
}

export function persistTerminalDockOpen(open: boolean): void {
  try {
    getStorage()?.setItem(DOCK_OPEN_STORAGE_KEY, open ? "1" : "0");
  } catch {
    // Ignore storage failures; the reducer state remains authoritative.
  }
}

export function resetTerminalDockPersistenceForTests(): void {
  terminalDockStateByAgentKey.clear();
}
