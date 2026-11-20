import terminalTheme from "./TerminalTheme.module.css";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import {
  reportTerminalTeardownError,
  terminalErrorDisplayMessage,
  terminalErrorMessage,
} from "@/features/terminal/lib/terminalErrors";
import type { TerminalExecution } from "@/features/transport/contracts/realtimeTransport";
import { useTerminalTransport } from "@/features/transport/hooks/useRealtimeTransport";
import { resolveTerminalTheme } from "@/features/terminal/lib/terminalTheme";
import type { TerminalAvailability } from "@/features/terminal/lib/terminalWorkspace";
import { formatRestoreTime } from "@/features/terminal/lib/terminalCommandTracker";
import {
  getTerminalHostAdapter,
  type TerminalHostAdapter,
} from "@/features/terminal/lib/hostAdapter";
import {
  detectShellDialect,
  formatDroppedPathsForShell,
} from "@/features/terminal/lib/shellEscape";
import {
  parseTerminalFileLinks,
  resolveTerminalLinkPath,
} from "@/features/terminal/lib/terminalFileLinks";
import { notifyTerminalActivityChanged } from "@/features/terminal/hooks/useActiveTerminalAgents";
import { useI18n } from "@/shared/i18n";
import { toText } from "@/shared/utils/eventUtils";
import "@xterm/xterm/css/xterm.css";
import styles from "./TerminalWorkspace.module.css";

const INPUT_CHUNK_SIZE = 4096;
const RESIZE_DEBOUNCE_MS = 120;
const TERMINAL_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans Mono CJK SC", monospace';
const TERMINAL_LINE_HEIGHT = 1.4;

function splitInputChunks(data: string, chunkSize = INPUT_CHUNK_SIZE): string[] {
  if (data.length <= chunkSize) {
    return [data];
  }
  const chunks: string[] = [];
  let offset = 0;
  while (offset < data.length) {
    let end = Math.min(offset + chunkSize, data.length);
    if (end < data.length) {
      const lastCode = data.charCodeAt(end - 1);
      const nextCode = data.charCodeAt(end);
      if (lastCode >= 0xd800 && lastCode <= 0xdbff && nextCode >= 0xdc00 && nextCode <= 0xdfff && end - 1 > offset) {
        end -= 1;
      }
    }
    chunks.push(data.slice(offset, end));
    offset = end;
  }
  return chunks;
}

export type TerminalMeta = {
  readonly shell?: string;
  readonly cwd?: string;
  readonly title?: string;
};

export type TerminalProfileOption = {
  readonly id: string;
  readonly label: string;
  readonly shell?: string;
  readonly default?: boolean;
};

export type TerminalPaneProps = {
  readonly tabId: string;
  readonly agentKey: string;
  readonly terminalKey: string;
  readonly initialCwd?: string;
  readonly initialProfile?: string;
  readonly availability: TerminalAvailability;
  readonly isActive: boolean;
  readonly themeMode: string;
  readonly macOptionIsMeta?: boolean;
  readonly hostAdapter?: TerminalHostAdapter;
  readonly onSessionChange: (
    tabId: string,
    session: TerminalExecution | null,
  ) => void;
  readonly onMetaChange?: (meta: TerminalMeta) => void;
  readonly onProfilesChange?: (profiles: readonly TerminalProfileOption[]) => void;
};

function parseTerminalProfiles(raw: unknown): TerminalProfileOption[] {
  if (!Array.isArray(raw)) return [];
  const parsed: TerminalProfileOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = toText(record.id);
    const label = toText(record.label);
    if (!id || !label) continue;
    const shell = toText(record.shell);
    parsed.push({
      id,
      label,
      ...(shell ? { shell } : {}),
      ...(record.default === true ? { default: true } : {}),
    });
  }
  return parsed;
}

function loadTerminalAddons(terminal: Terminal, container: HTMLElement): {
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
} {
  const fitAddon = new FitAddon();
  const unicode11Addon = new Unicode11Addon();
  const webLinksAddon = new WebLinksAddon((_event, uri) => {
    if (typeof window !== "undefined") {
      window.open(uri, "_blank", "noopener,noreferrer");
    }
  });
  const searchAddon = new SearchAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(unicode11Addon);
  terminal.unicode.activeVersion = "11";
  terminal.loadAddon(webLinksAddon);
  terminal.loadAddon(searchAddon);
  terminal.open(container);
  try {
    const webglAddon = new WebglAddon();
    terminal.loadAddon(webglAddon);
    webglAddon.onContextLoss(() => webglAddon.dispose());
  } catch {
    // WebGL can be unavailable or disabled; xterm keeps its DOM renderer.
  }
  return { fitAddon, searchAddon };
}

function hasMeasurableLayout(container: HTMLElement | null): boolean {
  if (!container || !container.isConnected || typeof window === "undefined") {
    return false;
  }
  for (let current: HTMLElement | null = container; current; current = current.parentElement) {
    if (current.style.display === "none") {
      return false;
    }
    const computed = window.getComputedStyle(current);
    if (computed.display === "none") {
      return false;
    }
  }
  const style = window.getComputedStyle(container);
  if (
    style.width.endsWith("%") ||
    style.height.endsWith("%") ||
    style.width === "auto" ||
    style.height === "auto"
  ) {
    return false;
  }
  return true;
}

function fitTerminal(
  fitAddon: FitAddon | null,
  container: HTMLElement | null,
  onError: (message: string) => void,
): boolean {
  if (!hasMeasurableLayout(container)) {
    return false;
  }
  try {
    fitAddon?.fit();
    return true;
  } catch (error) {
    if (error instanceof Error) {
      onError(error.message || error.name);
      return false;
    }
    throw error;
  }
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({
  tabId,
  agentKey,
  terminalKey,
  initialCwd,
  initialProfile,
  availability,
  isActive,
  themeMode,
  macOptionIsMeta = false,
  hostAdapter: hostAdapterProp,
  onSessionChange,
  onMetaChange,
  onProfilesChange,
}) => {
  const resolvedHostAdapter = hostAdapterProp ?? getTerminalHostAdapter();
  const hostAdapterRef = useRef(resolvedHostAdapter);
  hostAdapterRef.current = resolvedHostAdapter;
  const terminalTransport = useTerminalTransport();
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const remoteSessionRef = useRef<TerminalExecution | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [exitedInfo, setExitedInfo] = useState<{ exitCode: number | null } | null>(null);
  const [restartCount, setRestartCount] = useState(0);
  const restartingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const writePendingRef = useRef(false);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activityNotifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionVersionRef = useRef(0);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const initialCwdRef = useRef(initialCwd);
  initialCwdRef.current = initialCwd;
  const initialProfileRef = useRef(initialProfile);
  initialProfileRef.current = initialProfile;
  const macOptionIsMetaRef = useRef(Boolean(macOptionIsMeta));
  macOptionIsMetaRef.current = Boolean(macOptionIsMeta);
  const onSessionChangeRef = useRef(onSessionChange);
  onSessionChangeRef.current = onSessionChange;
  const onMetaChangeRef = useRef(onMetaChange);
  onMetaChangeRef.current = onMetaChange;
  const onProfilesChangeRef = useRef(onProfilesChange);
  onProfilesChangeRef.current = onProfilesChange;
  const metaStateRef = useRef<TerminalMeta>({});
  const initialWorkspaceCwdRef = useRef("");
  const availabilitySupported = availability.supported;
  const availabilityReasonRef = useRef(availability.supported ? "" : availability.reason);
  availabilityReasonRef.current = availability.supported ? "" : availability.reason;
  const lastSizeRef = useRef({ width: 0, height: 0 });

  const normalizedAgentKey = useMemo(() => toText(agentKey), [agentKey]);
  const normalizedTerminalKey = useMemo(() => toText(terminalKey) || "main", [terminalKey]);

  const writeStatus = useCallback((message: string) => {
    const terminal = terminalRef.current;
    const normalizedMessage = toText(message);
    if (!terminal || !normalizedMessage) return;
    terminal.write(`\r\n[terminal] ${normalizedMessage}\r\n`);
  }, []);

  const queueActivityRefresh = useCallback(() => {
    if (activityNotifyTimerRef.current) return;
    activityNotifyTimerRef.current = setTimeout(() => {
      activityNotifyTimerRef.current = null;
      notifyTerminalActivityChanged();
    }, 250);
  }, []);

  const queueInput = useCallback(
    (data: string) => {
      if (!data) return;
      const chunks = splitInputChunks(data);
      const submitsCommand = data.includes("\r") || data.includes("\n");
      const writeChunk = (chunk: string): Promise<void> => {
        const session = remoteSessionRef.current;
        if (!session) return Promise.resolve();
        return session.write(chunk).catch((error) => {
          writeStatus(terminalErrorMessage(error));
        });
      };

      let chain: Promise<void>;
      let startIndex = 0;
      if (!writePendingRef.current) {
        writePendingRef.current = true;
        chain = writeChunk(chunks[0]);
        startIndex = 1;
      } else {
        chain = writeChainRef.current;
      }

      for (let index = startIndex; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        chain = chain.then(() => writeChunk(chunk));
      }

      const tail = chain.finally(() => {
        if (writeChainRef.current === tail) {
          writePendingRef.current = false;
        }
        if (submitsCommand) {
          queueActivityRefresh();
        }
      });
      writeChainRef.current = tail;
    },
    [queueActivityRefresh, writeStatus],
  );

  const sendResize = useCallback(() => {
    resizeTimerRef.current = null;
    const terminal = terminalRef.current;
    const container = containerRef.current;
    if (!terminal || !fitTerminal(fitAddonRef.current, container, writeStatus)) {
      return;
    }
    if (!isActiveRef.current) {
      return;
    }
    void remoteSessionRef.current
      ?.resize(Math.max(1, terminal.cols || 80), Math.max(1, terminal.rows || 24))
      .catch((error) => {
        writeStatus(terminalErrorMessage(error));
      });
  }, [writeStatus]);

  const queueResize = useCallback(() => {
    if (resizeTimerRef.current) {
      clearTimeout(resizeTimerRef.current);
    }
    resizeTimerRef.current = setTimeout(sendResize, RESIZE_DEBOUNCE_MS);
  }, [sendResize]);

  const restartSession = useCallback(async () => {
    if (restartingRef.current) {
      return;
    }
    restartingRef.current = true;
    try {
      const currentSession = remoteSessionRef.current;
      if (currentSession) {
        sessionVersionRef.current += 1;
        remoteSessionRef.current = null;
        onSessionChangeRef.current(tabId, null);
        await currentSession.close().catch(reportTerminalTeardownError);
        notifyTerminalActivityChanged();
      }
      if (!mountedRef.current) {
        return;
      }
      setExitedInfo(null);
      setRestartCount((count) => count + 1);
    } finally {
      restartingRef.current = false;
    }
  }, [tabId]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    if (searchFocusTimerRef.current) {
      clearTimeout(searchFocusTimerRef.current);
    }
    searchFocusTimerRef.current = setTimeout(() => {
      searchFocusTimerRef.current = null;
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    searchAddonRef.current?.clearDecorations();
    terminalRef.current?.focus();
  }, []);

  const findNextMatch = useCallback(() => {
    if (!searchQuery) return;
    searchAddonRef.current?.findNext(searchQuery);
  }, [searchQuery]);

  const findPreviousMatch = useCallback(() => {
    if (!searchQuery) return;
    searchAddonRef.current?.findPrevious(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !normalizedAgentKey) return;

    const version = sessionVersionRef.current + 1;
    sessionVersionRef.current = version;
    const isCurrentSession = () => sessionVersionRef.current === version;
    let disposed = false;
    let remoteSession: TerminalExecution | null = null;
    let openCount = 0;
    let lastReportedError = "";
    setExitedInfo(null);

    const reportError = (error: unknown) => {
      const message = terminalErrorDisplayMessage(error, tRef.current);
      if (!message || message === lastReportedError) return;
      lastReportedError = message;
      writeStatus(message);
    };

    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      customGlyphs: true,
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: 13,
      lineHeight: TERMINAL_LINE_HEIGHT,
      scrollback: 5000,
      convertEol: false,
      macOptionIsMeta: macOptionIsMetaRef.current,
      theme: resolveTerminalTheme(themeMode),
    });
    const { fitAddon, searchAddon } = loadTerminalAddons(terminal, container);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    writeChainRef.current = Promise.resolve();
    writePendingRef.current = false;
    fitTerminal(fitAddon, container, writeStatus);

    if (!availabilitySupported) {
      writeStatus(availabilityReasonRef.current);
    }

    const metaState: { shell?: string; cwd?: string; title?: string } = {};
    metaStateRef.current = {};
    initialWorkspaceCwdRef.current = "";
    let pendingRestoreAt: number | null = null;
    let inReplay = false;
    let restoreDividerWritten = false;

    const flushRestoreDividerIfReady = () => {
      if (restoreDividerWritten || pendingRestoreAt === null || inReplay) {
        return;
      }
      restoreDividerWritten = true;
      const message = tRef.current("terminal.sessionRestored", {
        time: formatRestoreTime(pendingRestoreAt),
      });
      terminal.write(`\r\n\x1b[2m──── ${message} ────\x1b[0m\r\n`);
    };

    const emitMetaUpdate = (patch: TerminalMeta) => {
      let changed = false;
      if (patch.shell && patch.shell !== metaState.shell) {
        metaState.shell = patch.shell;
        changed = true;
      }
      if (patch.cwd && patch.cwd !== metaState.cwd) {
        metaState.cwd = patch.cwd;
        changed = true;
      }
      if (patch.title && patch.title !== metaState.title) {
        metaState.title = patch.title;
        changed = true;
      }
      if (changed) {
        metaStateRef.current = { ...metaState };
        onMetaChangeRef.current?.({ ...metaState });
      }
    };

    const handleTerminalEvent = (event: AgentEvent) => {
      if (disposed || !isCurrentSession()) return;
      const type = toText(event.type);
      if (type === "terminal.opened") {
        openCount += 1;
        const record = event as Record<string, unknown>;
        const shell = toText(record.shell);
        const cwd = toText(record.cwd);
        const title = toText(record.title);
        if (cwd && !initialWorkspaceCwdRef.current) {
          initialWorkspaceCwdRef.current = cwd;
        }
        if (shell || cwd || title) {
          emitMetaUpdate({
            ...(shell ? { shell } : {}),
            ...(cwd ? { cwd } : {}),
            ...(title ? { title } : {}),
          });
        }
        const profiles = parseTerminalProfiles(record.profiles);
        if (profiles.length > 0) {
          onProfilesChangeRef.current?.(profiles);
        }
        if (record.restored === true && !restoreDividerWritten) {
          pendingRestoreAt =
            typeof record.restoredAt === "number" && Number.isFinite(record.restoredAt)
              ? record.restoredAt
              : Date.now();
        }
        notifyTerminalActivityChanged();
        queueResize();
        return;
      }
      if (type === "terminal.replay.begin") {
        inReplay = true;
        if (openCount >= 2) {
          terminal.reset();
        }
        return;
      }
      if (type === "terminal.replay.end") {
        inReplay = false;
        flushRestoreDividerIfReady();
        return;
      }
      if (type === "shell.cwd") {
        const cwd = toText((event as Record<string, unknown>).cwd);
        if (cwd) {
          emitMetaUpdate({ cwd });
        }
        return;
      }
      if (type === "shell.title") {
        const title = toText((event as Record<string, unknown>).title);
        if (title) {
          emitMetaUpdate({ title });
        }
        return;
      }
      if (type === "shell.command.start" || type === "shell.command.end") {
        return;
      }
      if (type === "terminal.output") {
        flushRestoreDividerIfReady();
        terminal.write(String(event.data ?? ""));
        queueActivityRefresh();
        return;
      }
      if (type === "terminal.error") {
        const record = event as Record<string, unknown>;
        const code = toText(record.code);
        const status = typeof record.status === "number" ? record.status : 0;
        if (code === "protocol_version_mismatch" || status === 426) {
          reportError(tRef.current("terminal.error.versionMismatch"));
        } else {
          reportError(toText(record.message) || code || "terminal error");
        }
        return;
      }
      if (type === "terminal.exit") {
        remoteSessionRef.current = null;
        onSessionChangeRef.current(tabId, null);
        notifyTerminalActivityChanged();
        const rawCode = (event as Record<string, unknown>).exitCode;
        const exitCode =
          typeof rawCode === "number" && Number.isFinite(rawCode) ? rawCode : null;
        setExitedInfo({ exitCode });
        writeStatus(
          exitCode !== null
            ? tRef.current("terminal.exitedWithCode", { code: exitCode })
            : tRef.current("terminal.exited"),
        );
      }
    };

    const handleResize = () => {
      if (isActiveRef.current) queueResize();
    };
    window.addEventListener("resize", handleResize);
    terminal.attachCustomKeyEventHandler((event) => {
      if (
        event.type === "keydown" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        openSearch();
        return false;
      }
      return true;
    });
    const dataSubscription = terminal.onData(queueInput);
    const fileLinkProvider = terminal.registerLinkProvider?.({
      provideLinks: (bufferLineNumber, callback) => {
        const line = terminal.buffer?.active?.getLine(bufferLineNumber - 1);
        const text = line?.translateToString?.(true) ?? line?.translateToString?.() ?? "";
        if (!text) {
          callback(undefined);
          return;
        }
        const parsed = parseTerminalFileLinks(text);
        if (parsed.length === 0) {
          callback(undefined);
          return;
        }
        callback(
          parsed.map((item) => ({
            range: {
              start: { x: item.startIndex + 1, y: bufferLineNumber },
              end: { x: item.endIndex, y: bufferLineNumber },
            },
            text: item.rawText,
            activate: () => {
              const resolvedPath = resolveTerminalLinkPath(
                item.path,
                metaStateRef.current.cwd,
                initialWorkspaceCwdRef.current,
              );
              if (!resolvedPath) return;
              void hostAdapterRef.current.openFileLink({
                agentKey: normalizedAgentKey,
                path: resolvedPath,
                line: item.line,
                ...(item.col ? { col: item.col } : {}),
              });
            },
          })),
        );
      },
    });

    if (availabilitySupported) {
      const normalizedInitialCwd = toText(initialCwdRef.current);
      const normalizedInitialProfile = toText(initialProfileRef.current);
      remoteSession = terminalTransport.open({
        agentKey: normalizedAgentKey,
        terminalKey: normalizedTerminalKey,
        ...(normalizedInitialCwd ? { cwd: normalizedInitialCwd } : {}),
        ...(normalizedInitialProfile ? { profile: normalizedInitialProfile } : {}),
        cols: Math.max(1, terminal.cols || 80),
        rows: Math.max(1, terminal.rows || 24),
        onEvent: handleTerminalEvent,
        onOutput: (chunk, onWritten) => {
          if (disposed || !isCurrentSession()) return;
          flushRestoreDividerIfReady();
          terminal.write(chunk, onWritten);
          queueActivityRefresh();
        },
      });
      remoteSessionRef.current = remoteSession;
      onSessionChangeRef.current(tabId, remoteSession);
      void remoteSession.accepted.catch((error) => {
        if (disposed || !isCurrentSession() || error.name === "AbortError") return;
        remoteSessionRef.current = null;
        onSessionChangeRef.current(tabId, null);
        notifyTerminalActivityChanged();
        reportError(error);
      });
      void remoteSession.completion.then((completion) => {
        if (!isCurrentSession()) return;
        remoteSessionRef.current = null;
        onSessionChangeRef.current(tabId, null);
        notifyTerminalActivityChanged();
        if (completion.error && completion.error.name !== "AbortError") {
          reportError(completion.error);
        }
      });
    }

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      dataSubscription.dispose();
      fileLinkProvider?.dispose();
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
      if (activityNotifyTimerRef.current) {
        clearTimeout(activityNotifyTimerRef.current);
        activityNotifyTimerRef.current = null;
      }
      if (searchFocusTimerRef.current) {
        clearTimeout(searchFocusTimerRef.current);
        searchFocusTimerRef.current = null;
      }
      writeChainRef.current = Promise.resolve();
      writePendingRef.current = false;
      remoteSessionRef.current = null;
      onSessionChangeRef.current(tabId, null);
      if (remoteSession) {
        void remoteSession.detach().catch(reportTerminalTeardownError);
      }
      terminal.dispose();
      if (terminalRef.current === terminal) {
        terminalRef.current = null;
      }
      if (fitAddonRef.current === fitAddon) {
        fitAddonRef.current = null;
      }
      if (searchAddonRef.current === searchAddon) {
        searchAddonRef.current = null;
      }
    };
  }, [
    availabilitySupported,
    normalizedAgentKey,
    normalizedTerminalKey,
    openSearch,
    queueActivityRefresh,
    queueInput,
    queueResize,
    restartCount,
    tabId,
    terminalTransport,
    writeStatus,
  ]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = resolveTerminalTheme(themeMode);
    terminal.refresh(0, Math.max(0, terminal.rows - 1));
  }, [themeMode]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.macOptionIsMeta = Boolean(macOptionIsMeta);
  }, [macOptionIsMeta]);

  const executeHostAction = useCallback(async (
    action: "copy" | "paste" | "clear" | "restart" | "reveal-cwd" | "search",
  ) => {
    const terminal = terminalRef.current;
    if (action === "copy") {
      const selection = terminal?.hasSelection?.() ? terminal.getSelection() : "";
      if (selection) {
        await hostAdapterRef.current.writeClipboardText(selection);
      }
      return;
    }
    if (action === "paste") {
      const text = await hostAdapterRef.current.readClipboardText();
      if (text) {
        terminal?.paste(text);
      }
      terminal?.focus();
      return;
    }
    if (action === "clear") {
      terminal?.clear();
      if (
        remoteSessionRef.current &&
        detectShellDialect(metaStateRef.current.shell) !== "cmd"
      ) {
        queueInput("\x0c");
      }
      terminal?.focus();
      return;
    }
    if (action === "search") {
      openSearch();
      return;
    }
    if (action === "reveal-cwd") {
      const targetCwd = toText(metaStateRef.current.cwd) || initialWorkspaceCwdRef.current;
      if (targetCwd) {
        await hostAdapterRef.current.revealCwd(targetCwd);
      }
      return;
    }
    if (action === "restart") {
      await restartSession();
    }
  }, [openSearch, queueInput, restartSession]);

  useEffect(() => {
    return resolvedHostAdapter.subscribeShortcut((shortcut) => {
      if (!isActiveRef.current) return;
      void executeHostAction(shortcut.action);
    });
  }, [executeHostAction, resolvedHostAdapter]);

  useEffect(() => {
    if (!isActive) return;
    const terminal = terminalRef.current;
    if (terminal) {
      terminal.refresh(0, Math.max(0, terminal.rows - 1));
      terminal.focus();
    }
    queueResize();
  }, [isActive, queueResize, restartCount]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (
          width > 0 &&
          height > 0 &&
          (width !== lastSizeRef.current.width || height !== lastSizeRef.current.height)
        ) {
          lastSizeRef.current = { width, height };
          queueResize();
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [queueResize]);

  return (
    <div
      className={`terminal-pane ${styles["terminal-pane"]} ${terminalTheme["terminal-theme"]}`}
      aria-hidden={!isActive}
      style={{
        visibility: isActive ? "visible" : "hidden",
        pointerEvents: isActive ? "auto" : "none",
        zIndex: isActive ? 1 : 0,
        width: "100%",
        height: "100%",
      }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "f") {
          event.preventDefault();
          openSearch();
        }
      }}
    >
      <div
        ref={containerRef}
        className={`terminal-pane-host ${styles["terminal-pane-host"]}`}
        onContextMenu={(event) => {
          if (hostAdapterRef.current.kind !== "desktop") return;
          event.preventDefault();
          const terminal = terminalRef.current;
          const hasSelection = Boolean(terminal?.hasSelection?.());
          const currentCwd = toText(metaStateRef.current.cwd) || initialWorkspaceCwdRef.current;
          void hostAdapterRef.current
            .showContextMenu({
              hasSelection,
              ...(currentCwd ? { cwd: currentCwd } : {}),
            })
            .then((action) => {
              if (action) {
                return executeHostAction(action);
              }
              return undefined;
            });
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(event) => {
          const files = event.dataTransfer?.files ?? [];
          const uriList = event.dataTransfer?.getData?.("text/uri-list") ?? "";
          const droppedPaths = hostAdapterRef.current.resolveDroppedFilePaths({
            files,
            uriList,
          });
          if (droppedPaths.length === 0) return;
          event.preventDefault();
          const formatted = formatDroppedPathsForShell(droppedPaths, metaStateRef.current.shell);
          if (formatted) {
            queueInput(formatted);
          }
        }}
      />
      {exitedInfo ? (
        <div className={`terminal-exit-banner ${styles["terminal-exit-banner"]}`}>
          <span>
            {exitedInfo.exitCode !== null
              ? t("terminal.exitedWithCode", { code: exitedInfo.exitCode })
              : t("terminal.exited")}
          </span>
          <button
            type="button"
            data-terminal-restart="true"
            className={`terminal-exit-restart-btn ${styles["terminal-exit-restart-btn"]}`}
            onClick={() => {
              void restartSession();
            }}
          >
            {t("terminal.restart")}
          </button>
        </div>
      ) : null}
      {searchOpen ? (
        <div className={`terminal-search-bar ${styles["terminal-search-bar"]}`}>
          <input
            ref={searchInputRef}
            type="text"
            className={`terminal-search-input ${styles["terminal-search-input"]}`}
            placeholder={t("terminal.searchPlaceholder")}
            aria-label={t("terminal.searchPlaceholder")}
            value={searchQuery}
            onChange={(event) => {
              const next = event.target.value;
              setSearchQuery(next);
              if (next) {
                searchAddonRef.current?.findNext(next, { incremental: true });
              } else {
                searchAddonRef.current?.clearDecorations();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeSearch();
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (event.shiftKey) {
                  findPreviousMatch();
                } else {
                  findNextMatch();
                }
              }
            }}
          />
          <button
            type="button"
            className={`terminal-search-btn ${styles["terminal-search-btn"]}`}
            aria-label={t("terminal.searchPrev")}
            onClick={findPreviousMatch}
          >
            ↑
          </button>
          <button
            type="button"
            className={`terminal-search-btn ${styles["terminal-search-btn"]}`}
            aria-label={t("terminal.searchNext")}
            onClick={findNextMatch}
          >
            ↓
          </button>
          <button
            type="button"
            className={`terminal-search-btn ${styles["terminal-search-btn"]}`}
            aria-label={t("terminal.searchClose")}
            onClick={closeSearch}
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
};
