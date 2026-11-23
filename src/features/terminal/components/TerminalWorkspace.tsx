import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "@/app/state/AppContext";
import {
  TerminalPane,
  type TerminalMeta,
  type TerminalProfileOption,
} from "@/features/terminal/components/TerminalPane";
import { formatTerminalTabTitle } from "@/features/terminal/lib/terminalCommandTracker";
import {
  isMacTerminalPlatform,
  readMacOptionIsMeta,
  writeMacOptionIsMeta,
} from "@/features/terminal/lib/terminalPreferences";
import type { TerminalExecution } from "@/features/transport/contracts/realtimeTransport";
import { reportTerminalTeardownError } from "@/features/terminal/lib/terminalErrors";
import {
  resolveTerminalAvailability,
  resolveTerminalAvailabilityKey,
  type TerminalAvailability,
  type TerminalWorkerSummary,
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
import styles from "./TerminalWorkspace.module.css";

type TerminalTab = TerminalDockTabState;

function withModuleClasses(...classNames: string[]): string {
  return [
    ...classNames,
    ...classNames.map((className) => styles[className]).filter(Boolean),
  ].filter(Boolean).join(" ");
}

export interface TerminalWorkspaceProps {
  agentKey: string;
  workspaceKey?: string;
  worker?: TerminalWorkerSummary | null;
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
  const [tabMetaById, setTabMetaById] = useState<Record<string, TerminalMeta>>({});
  const [availableProfiles, setAvailableProfiles] = useState<readonly TerminalProfileOption[]>([]);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [macOptionIsMeta, setMacOptionIsMeta] = useState(() => readMacOptionIsMeta());
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const tabMetaByIdRef = useRef(tabMetaById);
  tabMetaByIdRef.current = tabMetaById;
  const initialCwdByTabIdRef = useRef<Record<string, string>>({});
  const initialProfileByTabIdRef = useRef<Record<string, string>>({});
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const tabCounterRef = useRef(initialState.nextIndex);
  const previousIdentityRef = useRef(
    `${normalizedAgentKey}\u0000${normalizedInitialTerminalKey}`,
  );
  const sessionsRef = useRef(new Map<string, TerminalExecution>());
  const isMacPlatform = isMacTerminalPlatform();
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
    initialCwdByTabIdRef.current = {};
    initialProfileByTabIdRef.current = {};
    setTabMetaById({});
    setAvailableProfiles([]);
    setProfileMenuOpen(false);
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

  useEffect(() => {
    if (!profileMenuOpen || typeof document === "undefined") return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (profileMenuRef.current && target && !profileMenuRef.current.contains(target)) {
        setProfileMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileMenuOpen]);

  const createTab = useCallback((profileId?: string) => {
    const normalizedProfile = typeof profileId === "string" ? toText(profileId) : "";
    const tab = createTerminalTab(tabCounterRef.current, t("terminal.defaultLabel"));
    tabCounterRef.current += 1;
    const inheritedCwd = toText(tabMetaByIdRef.current[activeTabIdRef.current]?.cwd);
    if (inheritedCwd) {
      initialCwdByTabIdRef.current[tab.id] = inheritedCwd;
    }
    if (normalizedProfile) {
      initialProfileByTabIdRef.current[tab.id] = normalizedProfile;
    }
    setProfileMenuOpen(false);
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
  }, [t]);

  const closeTab = useCallback((tabId: string) => {
    const session = sessionsRef.current.get(tabId);
    sessionsRef.current.delete(tabId);
    delete initialCwdByTabIdRef.current[tabId];
    delete initialProfileByTabIdRef.current[tabId];
    setTabMetaById((current) => {
      if (!(tabId in current)) return current;
      const next = { ...current };
      delete next[tabId];
      return next;
    });
    if (session) {
      void session.close()
        .catch(reportTerminalTeardownError)
        .finally(notifyTerminalActivityChanged);
    }
    setTabs((current) => current.filter((tab) => tab.id !== tabId));
    setActiveTabId((current) => (current === tabId ? "" : current));
  }, []);

  const handleMetaChange = useCallback((tabId: string, meta: TerminalMeta) => {
    setTabMetaById((current) => ({
      ...current,
      [tabId]: meta,
    }));
  }, []);

  const handleProfilesChange = useCallback((profiles: readonly TerminalProfileOption[]) => {
    setAvailableProfiles((current) => {
      if (
        current.length === profiles.length &&
        current.every(
          (item, index) =>
            item.id === profiles[index]?.id &&
            item.label === profiles[index]?.label &&
            Boolean(item.default) === Boolean(profiles[index]?.default),
        )
      ) {
        return current;
      }
      return profiles;
    });
  }, []);

  const handleToggleMacOptionIsMeta = useCallback(() => {
    setMacOptionIsMeta((current) => {
      const next = !current;
      writeMacOptionIsMeta(next);
      return next;
    });
  }, []);

  const handleSessionChange = useCallback(
    (tabId: string, session: TerminalExecution | null) => {
      if (session) sessionsRef.current.set(tabId, session);
      else sessionsRef.current.delete(tabId);
    },
    [],
  );

  return (
    <div className={withModuleClasses("terminal-workspace")}>
      <div className={withModuleClasses("terminal-dock-tabs")}>
        <div className={withModuleClasses("terminal-dock-tab-list")}>
          {tabs.map((tab, index) => (
            <div
              key={tab.id}
              className={withModuleClasses(
                "terminal-dock-tab",
                tab.id === activeTabId ? "terminal-dock-tab-active" : "",
              )}
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
              <span className={withModuleClasses("terminal-dock-tab-label")}>
                {formatTerminalTabTitle(
                  tabMetaById[tab.id] ?? {},
                  `${t("terminal.defaultLabel")}${tabs.length > 1 ? index + 1 : ""}`,
                )}
              </span>
              <button
                className={withModuleClasses("terminal-dock-tab-close")}
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
        <button className={withModuleClasses("terminal-dock-tab-add")} aria-label={t("terminal.new")} onClick={() => createTab()}>
          +
        </button>
        {availableProfiles.length > 1 ? (
          <div className={withModuleClasses("terminal-dock-profile-menu-wrap")} ref={profileMenuRef}>
            <button
              type="button"
              className={withModuleClasses("terminal-dock-profile-trigger")}
              aria-label={t("terminal.newProfileMenu")}
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              onClick={() => setProfileMenuOpen((open) => !open)}
            >
              ▾
            </button>
            {profileMenuOpen ? (
              <div className={withModuleClasses("terminal-dock-profile-menu")} role="menu">
                {availableProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    role="menuitem"
                    className={withModuleClasses("terminal-dock-profile-item")}
                    onClick={() => createTab(profile.id)}
                  >
                    {profile.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {isMacPlatform ? (
          <button
            type="button"
            className={withModuleClasses(
              "terminal-dock-option-toggle",
              macOptionIsMeta ? "terminal-dock-option-toggle-active" : "",
            )}
            aria-label={t("terminal.macOptionIsMeta")}
            aria-pressed={macOptionIsMeta}
            title={t("terminal.macOptionIsMetaTooltip")}
            onClick={handleToggleMacOptionIsMeta}
          >
            {t("terminal.macOptionIsMetaShort")}
          </button>
        ) : null}
        {onRequestClose ? (
          <button className={withModuleClasses("terminal-dock-close")} aria-label={t("topNav.terminal.close")} onClick={onRequestClose}>
            ×
          </button>
        ) : null}
      </div>
      <div className={withModuleClasses("terminal-dock-panes")}>
        {tabs.map((tab) => (
          <TerminalPane
            key={tab.id}
            tabId={tab.id}
            agentKey={normalizedAgentKey}
            terminalKey={tab.terminalKey}
            initialCwd={initialCwdByTabIdRef.current[tab.id]}
            initialProfile={initialProfileByTabIdRef.current[tab.id]}
            availability={availability}
            isActive={tab.id === activeTabId}
            themeMode={themeMode}
            macOptionIsMeta={macOptionIsMeta}
            onSessionChange={handleSessionChange}
            onMetaChange={(meta) => handleMetaChange(tab.id, meta)}
            onProfilesChange={handleProfilesChange}
          />
        ))}
        {tabs.length === 0 ? (
          <div className={withModuleClasses("terminal-dock-empty")}>
            <button className={withModuleClasses("terminal-dock-empty-add")} onClick={() => createTab()}>
              {t("terminal.emptyNew")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
