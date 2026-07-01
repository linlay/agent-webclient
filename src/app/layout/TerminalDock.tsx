import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "@/app/state/AppContext";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { TerminalPane } from "@/features/terminal/components/TerminalPane";
import {
  reportTerminalTeardownError,
  type TerminalRemoteSession,
} from "@/features/terminal/lib/terminalRemoteSession";
import {
  resolveTerminalAvailabilityKey,
  resolveTerminalAvailability,
  resolveTerminalDockWorkspaceKey,
} from "@/features/terminal/lib/terminalWorkspace";
import { resolveTerminalTheme } from "@/features/terminal/lib/terminalTheme";
import { toText } from "@/shared/utils/eventUtils";

export { resolveTerminalDockWorkspaceKey, resolveTerminalTheme };

type TerminalDockProps = {
  readonly agentKey: string;
  readonly workspaceKey?: string;
  readonly worker?: CurrentWorkerSummary | null;
};

type TerminalTab = {
  readonly id: string;
  readonly label: string;
  readonly terminalKey: string;
};

type TerminalDockState = {
  readonly tabs: readonly TerminalTab[];
  readonly activeTabId: string;
  readonly nextIndex: number;
};

const terminalDockStateByAgentKey = new Map<string, TerminalDockState>();

function generateTabId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function createTerminalTab(index: number): TerminalTab {
  return {
    id: generateTabId(),
    label: "终端",
    terminalKey: index === 0 ? "main" : `tab-${index}`,
  };
}

function defaultDockState(): TerminalDockState {
  const tab = createTerminalTab(0);
  return {
    tabs: [tab],
    activeTabId: tab.id,
    nextIndex: 1,
  };
}

function restoreDockState(agentKey: string): TerminalDockState {
  const normalizedAgentKey = toText(agentKey);
  if (!normalizedAgentKey) {
    return { tabs: [], activeTabId: "", nextIndex: 0 };
  }
  return terminalDockStateByAgentKey.get(normalizedAgentKey) || defaultDockState();
}

function persistDockState(agentKey: string, state: TerminalDockState): void {
  const normalizedAgentKey = toText(agentKey);
  if (!normalizedAgentKey) return;
  terminalDockStateByAgentKey.set(normalizedAgentKey, state);
}

export const TerminalDock: React.FC<TerminalDockProps> = ({
  agentKey,
  workspaceKey = "",
  worker = null,
}) => {
  const { themeMode } = useAppState();
  const normalizedAgentKey = useMemo(() => toText(agentKey), [agentKey]);
  const initialState = useMemo(
    () => restoreDockState(normalizedAgentKey),
    [normalizedAgentKey],
  );
  const [tabs, setTabs] = useState<readonly TerminalTab[]>(initialState.tabs);
  const [activeTabId, setActiveTabId] = useState(initialState.activeTabId);
  const tabCounterRef = useRef(initialState.nextIndex);
  const prevAgentKeyRef = useRef(normalizedAgentKey);
  const remoteSessionsRef = useRef(new Map<string, TerminalRemoteSession>());
  const availabilityKey = resolveTerminalAvailabilityKey(worker, workspaceKey);
  const availability = useMemo(
    () => resolveTerminalAvailability(worker, workspaceKey),
    [availabilityKey],
  );

  const [dockHeight, setDockHeight] = useState<number | null>(250);
  const isResizingRef = useRef(false);
  const resizeStartYRef = useRef(0);
  const resizeStartHeightRef = useRef(0);

  const handleResizeMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      isResizingRef.current = true;
      resizeStartYRef.current = event.clientY;
      resizeStartHeightRef.current =
        dockHeight ??
        document.querySelector(".terminal-dock")?.getBoundingClientRect()
          .height ??
        250;
    },
    [dockHeight],
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = resizeStartYRef.current - event.clientY;
      const nextHeight = Math.max(
        80,
        Math.min(
          window.innerHeight * 0.7,
          resizeStartHeightRef.current + delta,
        ),
      );
      setDockHeight(nextHeight);
    };
    const handleMouseUp = () => {
      isResizingRef.current = false;
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    if (prevAgentKeyRef.current === normalizedAgentKey) return;
    const nextState = restoreDockState(normalizedAgentKey);
    prevAgentKeyRef.current = normalizedAgentKey;
    tabCounterRef.current = nextState.nextIndex;
    remoteSessionsRef.current.clear();
    setTabs(nextState.tabs);
    setActiveTabId(nextState.activeTabId);
  }, [normalizedAgentKey]);

  useEffect(() => {
    persistDockState(normalizedAgentKey, {
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
    const tab = createTerminalTab(tabCounterRef.current);
    tabCounterRef.current += 1;
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }, []);

  const handleSessionChange = useCallback(
    (tabId: string, session: TerminalRemoteSession | null) => {
      if (session) {
        remoteSessionsRef.current.set(tabId, session);
        return;
      }
      remoteSessionsRef.current.delete(tabId);
    },
    [],
  );

  const closeTab = useCallback((tabId: string) => {
    const session = remoteSessionsRef.current.get(tabId);
    remoteSessionsRef.current.delete(tabId);
    if (session) {
      void session.close().catch(reportTerminalTeardownError);
    }
    setTabs((prev) => prev.filter((tab) => tab.id !== tabId));
    setActiveTabId((prevActive) => (prevActive === tabId ? "" : prevActive));
  }, []);

  return (
    <section
      className="terminal-dock"
      aria-label="终端面板"
      style={dockHeight != null ? { height: dockHeight } : undefined}
    >
      <div
        className="terminal-dock-resize-handle"
        onMouseDown={handleResizeMouseDown}
      />
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
                {tab.label}
                {tabs.length > 1 ? index + 1 : null}
              </span>
              <button
                className="terminal-dock-tab-close"
                aria-label={`关闭 ${tab.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
                tabIndex={0}
              >
                x
              </button>
            </div>
          ))}
        </div>
        <button
          className="terminal-dock-tab-add"
          aria-label="新建终端"
          onClick={createTab}
          tabIndex={0}
        >
          +
        </button>
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
            onSessionChange={handleSessionChange}
          />
        ))}
        {tabs.length === 0 && (
          <div className="terminal-dock-empty">
            <button
              className="terminal-dock-empty-add"
              onClick={createTab}
              tabIndex={0}
            >
              + 新建终端
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
