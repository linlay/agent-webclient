import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { AgentEvent } from "@/app/state/types";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import {
  getWsClient,
  initWsClient,
  updateCurrentWsClientOptions,
} from "@/features/transport/lib/wsClientSingleton";
import {
  type WsAccessTokenRefreshReason,
  type WsClient,
} from "@/features/transport/lib/wsClient";
import {
  ensureAccessToken,
  getCurrentAccessToken,
} from "@/shared/api/apiClient";
import "@xterm/xterm/css/xterm.css";

const INPUT_FLUSH_DELAY_MS = 12;
const RESIZE_DEBOUNCE_MS = 120;

interface TerminalDockProps {
  agentKey: string;
  chatId?: string;
  workspaceKey?: string;
}

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isChatWorkspaceKey(workspaceKey: string): boolean {
  return toText(workspaceKey).toLowerCase() === "@chat";
}

function terminalErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error || "terminal error");
}

async function resolveTerminalAccessToken(
  reason: WsAccessTokenRefreshReason = "missing",
): Promise<string> {
  const token = String((await ensureAccessToken(reason)) || "").trim();
  return token || String(getCurrentAccessToken() || "").trim();
}

async function resolveTerminalWsClient(): Promise<WsClient> {
  let accessToken = String(getCurrentAccessToken() || "").trim();
  if (!accessToken) {
    accessToken = await resolveTerminalAccessToken("missing");
  }

  const options = {
    accessToken,
    resolveAccessToken: resolveTerminalAccessToken,
  };
  const current = getWsClient();
  if (current) {
    return updateCurrentWsClientOptions(options) || current;
  }
  return initWsClient(options);
}

export function resolveTerminalDockWorkspaceKey(
  worker: CurrentWorkerSummary | null,
): string {
  if (!worker || worker.type !== "agent") return "";
  const raw = isObjectRecord(worker.raw) ? worker.raw : {};
  const workspace = isObjectRecord(raw.workspace) ? raw.workspace : {};
  return toText(raw.workspaceDir || workspace.root || worker.row.workspaceDir);
}

export const TerminalDock: React.FC<TerminalDockProps> = ({
  agentKey,
  chatId = "",
  workspaceKey = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsClientRef = useRef<WsClient | null>(null);
  const activeTerminalIdRef = useRef("");
  const inputBufferRef = useRef("");
  const inputFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionVersionRef = useRef(0);

  const normalizedAgentKey = useMemo(() => toText(agentKey), [agentKey]);
  const normalizedWorkspaceKey = useMemo(
    () => toText(workspaceKey),
    [workspaceKey],
  );
  const terminalChatId = useMemo(
    () => (isChatWorkspaceKey(normalizedWorkspaceKey) ? toText(chatId) : ""),
    [chatId, normalizedWorkspaceKey],
  );

  const writeStatus = useCallback((message: string) => {
    const terminal = terminalRef.current;
    const normalizedMessage = toText(message);
    if (!terminal || !normalizedMessage) return;
    terminal.write(`\r\n[terminal] ${normalizedMessage}\r\n`);
  }, []);

  const flushInput = useCallback(() => {
    inputFlushTimerRef.current = null;
    const data = inputBufferRef.current;
    inputBufferRef.current = "";
    if (!data) return;

    const terminalId = activeTerminalIdRef.current;
    const client = wsClientRef.current;
    if (!terminalId || !client) return;

    void client.request({
      type: "/api/terminal/input",
      payload: {
        terminalId,
        data,
      },
    }).catch((error) => {
      writeStatus(terminalErrorMessage(error));
    });
  }, [writeStatus]);

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

    try {
      fitAddonRef.current?.fit();
    } catch {
      // xterm can throw while the dock is mid-layout; the next resize will retry.
    }

    const terminalId = activeTerminalIdRef.current;
    const client = wsClientRef.current;
    if (!terminalId || !client) return;

    void client.request({
      type: "/api/terminal/resize",
      payload: {
        terminalId,
        cols: Math.max(1, terminal.cols || 80),
        rows: Math.max(1, terminal.rows || 24),
      },
    }).catch((error) => {
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
    let terminalId = "";
    let client: WsClient | null = null;
    let streamAbort: (() => void) | null = null;

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      scrollback: 5000,
      convertEol: false,
    });
    const fitAddon = new FitAddon();
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    activeTerminalIdRef.current = "";
    inputBufferRef.current = "";

    terminal.loadAddon(fitAddon);
    terminal.open(container);
    try {
      fitAddon.fit();
    } catch {
      // The dock may still be measuring on first mount.
    }

    const closeRemoteTerminal = () => {
      const id = terminalId || activeTerminalIdRef.current;
      if (!id || !client) return;
      if (activeTerminalIdRef.current === id) {
        activeTerminalIdRef.current = "";
      }
      terminalId = "";
      void client.request({
        type: "/api/terminal/close",
        payload: { terminalId: id },
      }).catch(() => {
        // Closing is best-effort during teardown.
      });
    };

    const stopStream = () => {
      streamAbort?.();
      streamAbort = null;
    };

    const handleTerminalEvent = (event: AgentEvent) => {
      const type = toText(event.type);
      if (type === "terminal.opened") {
        const id = toText(event.terminalId);
        terminalId = id;
        if (!id) return;
        if (disposed || !isCurrentSession()) {
          closeRemoteTerminal();
          stopStream();
          return;
        }
        activeTerminalIdRef.current = id;
        queueResize();
        return;
      }

      if (disposed || !isCurrentSession()) return;

      if (type === "terminal.output") {
        terminal.write(String(event.data ?? ""));
      } else if (type === "terminal.exit") {
        activeTerminalIdRef.current = "";
      }
    };

    const handleResize = () => queueResize();
    window.addEventListener("resize", handleResize);

    const dataSubscription = terminal.onData(queueInput);

    void resolveTerminalWsClient()
      .then((resolvedClient) => {
        client = resolvedClient;
        if (disposed || !isCurrentSession()) {
          return;
        }
        wsClientRef.current = resolvedClient;
        const payload: Record<string, unknown> = {
          agentKey: normalizedAgentKey,
          cols: Math.max(1, terminal.cols || 80),
          rows: Math.max(1, terminal.rows || 24),
        };
        if (terminalChatId) {
          payload.chatId = terminalChatId;
        }
        const stream = resolvedClient.stream({
          type: "/api/terminal/open",
          payload,
          onEvent: handleTerminalEvent,
          onDone: () => {
            if (isCurrentSession()) {
              activeTerminalIdRef.current = "";
            }
          },
          onError: (error) => {
            if (disposed || !isCurrentSession() || error.name === "AbortError") {
              return;
            }
            activeTerminalIdRef.current = "";
            writeStatus(terminalErrorMessage(error));
          },
        });
        streamAbort = stream.abort;
      })
      .catch((error) => {
        if (disposed || !isCurrentSession()) return;
        writeStatus(terminalErrorMessage(error));
      });

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
      inputBufferRef.current = "";

      if (terminalId || activeTerminalIdRef.current) {
        closeRemoteTerminal();
        stopStream();
      }

      terminal.dispose();
      if (terminalRef.current === terminal) {
        terminalRef.current = null;
      }
      if (fitAddonRef.current === fitAddon) {
        fitAddonRef.current = null;
      }
      if (wsClientRef.current === client) {
        wsClientRef.current = null;
      }
    };
  }, [
    normalizedAgentKey,
    normalizedWorkspaceKey,
    queueInput,
    queueResize,
    terminalChatId,
    writeStatus,
  ]);

  return (
    <section
      ref={containerRef}
      className="terminal-dock"
      aria-label="终端面板"
    ></section>
  );
};
