import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "@/app/state/AppContext";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { TerminalPane } from "@/features/terminal/components/TerminalPane";
import type { TerminalExecution } from "@/features/transport/contracts/realtimeTransport";
import { reportTerminalTeardownError } from "@/features/terminal/lib/terminalErrors";
import {
  resolveTerminalAvailability,
  resolveTerminalAvailabilityKey,
  type TerminalAvailability,
} from "@/features/terminal/lib/terminalWorkspace";
import {
  persistTerminalDockState,
  restoreTerminalDockState,
  type TerminalDockStoredState,
  type TerminalDockTabState,
} from "@/features/terminal/lib/terminalDockPersistence";
import { notifyTerminalActivityChanged } from "@/features/terminal/hooks/useActiveTerminalAgents";
import { useI18n } from "@/shared/i18n";
import { toText } from "@/shared/utils/eventUtils";

type TerminalTab = TerminalDockTabState;

export interface TerminalWorkspaceProps {
  agentKey: string;
  workspaceKey?: string;
  worker?: CurrentWorkerSummary | null;
  availability?: TerminalAvailability;
  initialTerminalKey?: string;
  onRequestClose?: () => void;
}

function generateTabId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function createTerminalTab(index: number, label: string, terminalKey?: string): TerminalTab {
  return {
    id: generateTabId(),
    label,
    terminalKey: terminalKey || (index === 0 ? "main" : `tab-${index}`),
  };
}

function defaultState(label: string, terminalKey: string): TerminalDockStoredState {
  const tab = createTerminalTab(0, label, terminalKey);
  return { tabs: [tab], activeTabId: tab.id, nextIndex: 1 };
}

function restoreState(
  agentKey: string,
  label: string,
  terminalKey: string,
): TerminalDockStoredState {
  const normalizedAgentKey = toText(agentKey);
  if (!normalizedAgentKey) return { tabs: [], activeTabId: "", nextIndex: 0 };
  const restored = restoreTerminalDockState(
    normalizedAgentKey,
    defaultState(label, terminalKey),
  );
  if (restored.tabs.some((tab) => tab.terminalKey === terminalKey)) return restored;
  const tab = createTerminalTab(restored.nextIndex, label, terminalKey);
  return {
    tabs: [...restored.tabs, tab],
    activeTabId: tab.id,
    nextIndex: restored.nextIndex + 1,
  };
}

export const TerminalWorkspace: React.FC<TerminalWorkspaceProps> = ({
  agentKey,
  workspaceKey = "",
  worker = null,
  availability: availabilityOverride,
  initialTerminalKey = "main",
  onRequestClose,
}) => {
  const { themeMode } = useAppState();
  const { t } = useI18n();
  const normalizedAgentKey = useMemo(() => toText(agentKey), [agentKey]);
  const normalizedInitialTerminalKey = useMemo(
    () => toText(initialTerminalKey) || "main",
    [initialTerminalKey],
  );
  const initialState = useMemo(
    () => restoreState(
      normalizedAgentKey,
      t("terminal.defaultLabel"),
      normalizedInitialTerminalKey,
    ),
    [normalizedAgentKey, normalizedInitialTerminalKey, t],
  );
  const [tabs, setTabs] = useState<readonly TerminalTab[]>(initialState.tabs);
  const [activeTabId, setActiveTabId] = useState(initialState.activeTabId);
  const tabCounterRef = useRef(initialState.nextIndex);
  const previousIdentityRef = useRef(
    `${normalizedAgentKey}\u0000${normalizedInitialTerminalKey}`,
  );
  const sessionsRef = useRef(new Map<string, TerminalExecution>());
  const availabilityKey = resolveTerminalAvailabilityKey(worker, workspaceKey);
  const availability = useMemo(
    () => availabilityOverride || resolveTerminalAvailability(worker, workspaceKey, t),
    [availabilityKey, availabilityOverride, t],
  );

  useEffect(() => {
    const identity = `${normalizedAgentKey}\u0000${normalizedInitialTerminalKey}`;
    if (previousIdentityRef.current === identity) return;
    previousIdentityRef.current = identity;
    const next = restoreState(
      normalizedAgentKey,
      t("terminal.defaultLabel"),
      normalizedInitialTerminalKey,
    );
    sessionsRef.current.clear();
    tabCounterRef.current = next.nextIndex;
    setTabs(next.tabs);
    setActiveTabId(next.activeTabId);
  }, [normalizedAgentKey, normalizedInitialTerminalKey, t]);

  useEffect(() => {
    if (!normalizedAgentKey) return;
    persistTerminalDockState(normalizedAgentKey, {
      tabs,
      activeTabId,
      nextIndex: tabCounterRef.current,
    });
  }, [activeTabId, normalizedAgentKey, tabs]);

  useEffect(() => {
    if (!activeTabId && tabs.length > 0) {
      setActiveTabId(tabs[tabs.length - 1]?.id || "");
    }
  }, [activeTabId, tabs]);

  const createTab = useCallback(() => {
    const tab = createTerminalTab(tabCounterRef.current, t("terminal.defaultLabel"));
    tabCounterRef.current += 1;
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
  }, [t]);

  const closeTab = useCallback((tabId: string) => {
    const session = sessionsRef.current.get(tabId);
    sessionsRef.current.delete(tabId);
    if (session) {
      void session.close()
        .catch(reportTerminalTeardownError)
        .finally(notifyTerminalActivityChanged);
    }
    setTabs((current) => current.filter((tab) => tab.id !== tabId));
    setActiveTabId((current) => (current === tabId ? "" : current));
  }, []);

  return (
    <div className="terminal-workspace">
      <div className="terminal-dock-tabs">
        <div className="terminal-dock-tab-list">
          {tabs.map((tab, index) => (
            <div
              key={tab.id}
              className={`terminal-dock-tab ${tab.id === activeTabId ? "terminal-dock-tab-active" : ""}`}
              onClick={() => setActiveTabId(tab.id)}
              role="tab"
              aria-selected={tab.id === activeTabId}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setActiveTabId(tab.id);
                }
              }}
            >
              <span className="terminal-dock-tab-label">
                {t("terminal.defaultLabel")}{tabs.length > 1 ? index + 1 : null}
              </span>
              <button
                className="terminal-dock-tab-close"
                aria-label={t("terminal.closeTab", { name: tab.label })}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button className="terminal-dock-tab-add" aria-label={t("terminal.new")} onClick={createTab}>
          +
        </button>
        {onRequestClose ? (
          <button className="terminal-dock-close" aria-label={t("topNav.terminal.close")} onClick={onRequestClose}>
            ×
          </button>
        ) : null}
      </div>
      <div className="terminal-dock-panes">
        {tabs.map((tab) => (
          <TerminalPane
            key={tab.id}
            tabId={tab.id}
            agentKey={normalizedAgentKey}
            terminalKey={tab.terminalKey}
            availability={availability}
            isActive={tab.id === activeTabId}
            themeMode={themeMode}
            onSessionChange={(tabId, session) => {
              if (session) sessionsRef.current.set(tabId, session);
              else sessionsRef.current.delete(tabId);
            }}
          />
        ))}
        {tabs.length === 0 ? (
          <div className="terminal-dock-empty">
            <button className="terminal-dock-empty-add" onClick={createTab}>
              {t("terminal.emptyNew")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
