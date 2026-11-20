import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAppState } from "@/app/state/AppContext";
import {
  TerminalPane,
  type TerminalMeta,
} from "@/features/terminal/components/TerminalPane";
import { TerminalWorkspace } from "@/features/terminal/components/TerminalWorkspace";
import { formatTerminalTabTitle } from "@/features/terminal/lib/terminalCommandTracker";
import {
  MAC_OPTION_IS_META_STORAGE_KEY,
  readMacOptionIsMeta,
} from "@/features/terminal/lib/terminalPreferences";
import { useI18n } from "@/shared/i18n";
import { isDesktopAppMode } from "@/shared/utils/routing";
import styles from "@/features/terminal/components/TerminalWorkspace.module.css";

const noopSessionChange = () => undefined;

export const TerminalPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const params = useParams<{ agentKey: string }>();
  const { themeMode } = useAppState();
  const { t } = useI18n();
  const desktopMode = isDesktopAppMode();
  const agentKey = useMemo(
    () => String(params.agentKey || "").trim(),
    [params.agentKey],
  );
  const terminalKey = useMemo(
    () => String(searchParams.get("terminalKey") || "").trim() || "main",
    [searchParams],
  );
  const initialCwd = useMemo(
    () => String(searchParams.get("cwd") || "").trim() || undefined,
    [searchParams],
  );
  const initialProfile = useMemo(
    () => String(searchParams.get("profile") || "").trim() || undefined,
    [searchParams],
  );
  const [macOptionIsMeta, setMacOptionIsMeta] = useState(() => readMacOptionIsMeta());
  const [terminalMeta, setTerminalMeta] = useState<TerminalMeta>({});
  const previousIdentityRef = useRef(`${agentKey}\u0000${terminalKey}`);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === MAC_OPTION_IS_META_STORAGE_KEY) {
        setMacOptionIsMeta(readMacOptionIsMeta());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    const nextIdentity = `${agentKey}\u0000${terminalKey}`;
    if (previousIdentityRef.current === nextIdentity) {
      return;
    }
    previousIdentityRef.current = nextIdentity;
    setTerminalMeta({});
  }, [agentKey, terminalKey]);

  useEffect(() => {
    if (!desktopMode || typeof document === "undefined") {
      return;
    }
    const nextTitle = formatTerminalTabTitle(terminalMeta, "");
    if (nextTitle) {
      document.title = nextTitle;
    }
  }, [desktopMode, terminalMeta]);

  const handleMetaChange = useCallback((meta: TerminalMeta) => {
    setTerminalMeta(meta);
  }, []);

  if (!agentKey) {
    return (
      <main
        className={`terminal-surface terminal-surface-invalid ${styles["terminal-surface"]} ${styles["terminal-surface-invalid"]}`}
        role="alert"
      >
        <strong>{t("terminal.panelAria")}</strong>
        <span>{t("platformError.code.invalid_request")}</span>
      </main>
    );
  }

  if (desktopMode) {
    return (
      <main
        className={`terminal-surface terminal-surface-single ${styles["terminal-surface"]}`}
        aria-label={t("terminal.panelAria")}
      >
        <div className={`terminal-single-body ${styles["terminal-single-body"]}`}>
          <TerminalPane
            tabId={terminalKey}
            agentKey={agentKey}
            terminalKey={terminalKey}
            initialCwd={initialCwd}
            initialProfile={initialProfile}
            availability={{ supported: true }}
            isActive
            themeMode={themeMode}
            macOptionIsMeta={macOptionIsMeta}
            onSessionChange={noopSessionChange}
            onMetaChange={handleMetaChange}
          />
        </div>
      </main>
    );
  }

  return (
    <main className={`terminal-surface ${styles["terminal-surface"]}`} aria-label={t("terminal.panelAria")}>
      <TerminalWorkspace
        agentKey={agentKey}
        initialTerminalKey={terminalKey}
        availability={{ supported: true }}
      />
    </main>
  );
};
