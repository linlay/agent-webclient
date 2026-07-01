import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { AgentEvent } from "@/app/state/types";
import {
  createTerminalRemoteSession,
  reportTerminalTeardownError,
  terminalErrorMessage,
  type TerminalRemoteSession,
} from "@/features/terminal/lib/terminalRemoteSession";
import { resolveTerminalWsClient } from "@/features/terminal/lib/terminalTransport";
import { resolveTerminalTheme } from "@/features/terminal/lib/terminalTheme";
import type { TerminalAvailability } from "@/features/terminal/lib/terminalWorkspace";
import { notifyTerminalActivityChanged } from "@/features/terminal/hooks/useActiveTerminalAgents";
import { toText } from "@/shared/utils/eventUtils";
import "@xterm/xterm/css/xterm.css";

const INPUT_FLUSH_DELAY_MS = 12;
const RESIZE_DEBOUNCE_MS = 120;

export type TerminalPaneProps = {
  readonly tabId: string;
  readonly agentKey: string;
  readonly terminalKey: string;
  readonly availability: TerminalAvailability;
  readonly isActive: boolean;
  readonly themeMode: string;
  readonly onSessionChange: (
    tabId: string,
    session: TerminalRemoteSession | null,
  ) => void;
};

function fitTerminal(
  fitAddon: FitAddon | null,
  onError: (message: string) => void,
): void {
  try {
    fitAddon?.fit();
  } catch (error) {
    if (error instanceof Error) {
      onError(error.message || error.name);
      return;
    }
    throw error;
  }
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({
  tabId,
  agentKey,
  terminalKey,
  availability,
  isActive,
  themeMode,
  onSessionChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const remoteSessionRef = useRef<TerminalRemoteSession | null>(null);
  const inputBufferRef = useRef("");
  const inputFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activityNotifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionVersionRef = useRef(0);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

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

  const flushInput = useCallback(() => {
    inputFlushTimerRef.current = null;
    const data = inputBufferRef.current;
    inputBufferRef.current = "";
    if (!data) return;
    const submitsCommand = data.includes("\r") || data.includes("\n");
    void remoteSessionRef.current?.sendInput(data).catch((error) => {
      writeStatus(terminalErrorMessage(error));
    }).finally(() => {
      if (submitsCommand) {
        queueActivityRefresh();
      }
    });
  }, [queueActivityRefresh, writeStatus]);

  const queueInput = useCallback(
    (data: string) => {
      if (!data) return;
      inputBufferRef.current += data;
      if (inputFlushTimerRef.current) return;
      inputFlushTimerRef.current = setTimeout(flushInput, INPUT_FLUSH_DELAY_MS);
    },
    [flushInput],
  );

  const sendResize = useCallback(() => {
    resizeTimerRef.current = null;
    const terminal = terminalRef.current;
    if (!terminal) return;
    fitTerminal(fitAddonRef.current, writeStatus);
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !normalizedAgentKey) return;

    const version = sessionVersionRef.current + 1;
    sessionVersionRef.current = version;
    const isCurrentSession = () => sessionVersionRef.current === version;
    let disposed = false;
    let remoteSession: TerminalRemoteSession | null = null;

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      scrollback: 5000,
      convertEol: false,
      theme: resolveTerminalTheme(themeMode),
    });
    const fitAddon = new FitAddon();
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    inputBufferRef.current = "";
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitTerminal(fitAddon, writeStatus);

    if (!availability.supported) {
      writeStatus(availability.reason);
    }

    const handleTerminalEvent = (event: AgentEvent) => {
      if (disposed || !isCurrentSession()) return;
      const type = toText(event.type);
      if (type === "terminal.opened") {
        notifyTerminalActivityChanged();
        queueResize();
        return;
      }
      if (type === "terminal.output") {
        terminal.write(String(event.data ?? ""));
        queueActivityRefresh();
        return;
      }
      if (type === "terminal.exit") {
        remoteSessionRef.current = null;
        onSessionChange(tabId, null);
        notifyTerminalActivityChanged();
      }
    };

    const handleResize = () => {
      if (isActiveRef.current) queueResize();
    };
    window.addEventListener("resize", handleResize);
    const dataSubscription = terminal.onData(queueInput);

    if (availability.supported) {
      void resolveTerminalWsClient()
        .then((client) => {
          if (disposed || !isCurrentSession()) return;
          remoteSession = createTerminalRemoteSession({
            client,
            agentKey: normalizedAgentKey,
            terminalKey: normalizedTerminalKey,
            cols: Math.max(1, terminal.cols || 80),
            rows: Math.max(1, terminal.rows || 24),
            onEvent: handleTerminalEvent,
            onDone: () => {
              if (!isCurrentSession()) return;
              remoteSessionRef.current = null;
              onSessionChange(tabId, null);
              notifyTerminalActivityChanged();
            },
            onError: (error) => {
              if (disposed || !isCurrentSession() || error.name === "AbortError") return;
              remoteSessionRef.current = null;
              onSessionChange(tabId, null);
              notifyTerminalActivityChanged();
              writeStatus(terminalErrorMessage(error));
            },
          });
          remoteSessionRef.current = remoteSession;
          onSessionChange(tabId, remoteSession);
        })
        .catch((error) => {
          if (disposed || !isCurrentSession()) return;
          writeStatus(terminalErrorMessage(error));
        });
    }

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      dataSubscription.dispose();
      if (inputFlushTimerRef.current) {
        clearTimeout(inputFlushTimerRef.current);
        inputFlushTimerRef.current = null;
      }
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
      if (activityNotifyTimerRef.current) {
        clearTimeout(activityNotifyTimerRef.current);
        activityNotifyTimerRef.current = null;
      }
      inputBufferRef.current = "";
      remoteSessionRef.current = null;
      onSessionChange(tabId, null);
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
    };
  }, [
    availability,
    normalizedAgentKey,
    normalizedTerminalKey,
    onSessionChange,
    queueActivityRefresh,
    queueInput,
    queueResize,
    tabId,
    writeStatus,
  ]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = resolveTerminalTheme(themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (isActive) queueResize();
  }, [isActive, queueResize]);

  return (
    <div
      ref={containerRef}
      className="terminal-pane"
      style={{
        display: isActive ? "block" : "none",
        width: "100%",
        height: "100%",
      }}
    />
  );
};
