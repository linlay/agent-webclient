import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Terminal } from "@xterm/xterm";
import type { ITheme } from "@xterm/xterm";
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
import { useAppState } from "@/app/state/AppContext";
import "@xterm/xterm/css/xterm.css";

const INPUT_FLUSH_DELAY_MS = 12;
const RESIZE_DEBOUNCE_MS = 120;

interface TerminalDockProps {
  agentKey: string;
  chatId?: string;
  workspaceKey?: string;
}

interface TerminalTab {
  id: string;
  label: string;
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

export function resolveTerminalTheme(themeMode: string): ITheme {
  const isDark = themeMode === "dark";
  if (isDark) {
    return {
      foreground: "#c9cdd4",
      background: "#181818",
      cursor: "#c9cdd4",
      cursorAccent: "#181818",
      selectionBackground: "rgba(79, 136, 255, 0.28)",
      selectionForeground: "#f2f3f5",
      black: "#1e1e2e",
      red: "#f38ba8",
      green: "#a6e3a1",
      yellow: "#f9e2af",
      blue: "#89b4fa",
      magenta: "#cba6f7",
      cyan: "#94e2d5",
      white: "#bac2de",
      brightBlack: "#45475a",
      brightRed: "#f38ba8",
      brightGreen: "#a6e3a1",
      brightYellow: "#f9e2af",
      brightBlue: "#89b4fa",
      brightMagenta: "#cba6f7",
      brightCyan: "#94e2d5",
      brightWhite: "#cdd6f4",
    };
  }
  return {
    foreground: "#2c2c2c",
    background: "#fff",
    cursor: "#2c2c2c",
    cursorAccent: "#fafafa",
    selectionBackground: "rgba(38, 99, 235, 0.2)",
    selectionForeground: "#1d2129",
    black: "#2e3436",
    red: "#cc0000",
    green: "#4e9a06",
    yellow: "#c4a000",
    blue: "#3465a4",
    magenta: "#75507b",
    cyan: "#06989a",
    white: "#d3d7cf",
    brightBlack: "#555753",
    brightRed: "#ef2929",
    brightGreen: "#8ae234",
    brightYellow: "#fce94f",
    brightBlue: "#729fcf",
    brightMagenta: "#ad7fa8",
    brightCyan: "#34e2e2",
    brightWhite: "#eeeeec",
  };
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

// ---- TerminalPane: 单个终端实例 ----

interface TerminalPaneProps {
  agentKey: string;
  chatId: string;
  workspaceKey: string;
  isActive: boolean;
  themeMode: string;
}

const TerminalPane: React.FC<TerminalPaneProps> = ({
  agentKey,
  chatId,
  workspaceKey,
  isActive,
  themeMode,
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
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

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

    void client
      .request({
        type: "/api/terminal/input",
        payload: {
          terminalId,
          data,
        },
      })
      .catch((error) => {
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

    void client
      .request({
        type: "/api/terminal/resize",
        payload: {
          terminalId,
          cols: Math.max(1, terminal.cols || 80),
          rows: Math.max(1, terminal.rows || 24),
        },
      })
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
      theme: resolveTerminalTheme(themeMode),
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
      void client
        .request({
          type: "/api/terminal/close",
          payload: { terminalId: id },
        })
        .catch(() => {
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

    const handleResize = () => {
      if (isActiveRef.current) queueResize();
    };
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
            if (
              disposed ||
              !isCurrentSession() ||
              error.name === "AbortError"
            ) {
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

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = resolveTerminalTheme(themeMode);
  }, [themeMode]);

  // 当标签页变为活跃时触发 resize 以适应容器
  useEffect(() => {
    if (isActive) {
      queueResize();
    }
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

// ---- TerminalDock: 多标签页管理器 ----

function generateTabId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const TerminalDock: React.FC<TerminalDockProps> = ({
  agentKey,
  chatId = "",
  workspaceKey = "",
}) => {
  const { themeMode } = useAppState();
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const tabCounterRef = useRef(0);
  const prevAgentKeyRef = useRef(agentKey);

  const normalizedAgentKey = useMemo(() => toText(agentKey), [agentKey]);

  // ---- 拖拽调整高度 ----
  const [dockHeight, setDockHeight] = useState<number | null>(250);
  const isResizingRef = useRef(false);
  const resizeStartYRef = useRef(0);
  const resizeStartHeightRef = useRef(0);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      resizeStartYRef.current = e.clientY;
      resizeStartHeightRef.current =
        dockHeight ??
        document.querySelector(".terminal-dock")?.getBoundingClientRect()
          .height ??
        250;
    },
    [dockHeight],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = resizeStartYRef.current - e.clientY;
      const newHeight = Math.max(
        80,
        Math.min(
          window.innerHeight * 0.7,
          resizeStartHeightRef.current + delta,
        ),
      );
      setDockHeight(newHeight);
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

  const createTab = useCallback(() => {
    tabCounterRef.current += 1;
    const newTab: TerminalTab = {
      id: generateTabId(),
      label: "终端",
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    setActiveTabId((prevActive) => {
      if (prevActive !== tabId) return prevActive;
      return ""; // 由下方 useEffect 接管激活相邻标签
    });
  }, []);

  // 当 activeTabId 被清空时（关闭了活跃标签），切换到相邻标签
  useEffect(() => {
    if (!activeTabId && tabs.length > 0) {
      setActiveTabId(tabs[tabs.length - 1].id);
    }
  }, [activeTabId, tabs]);

  // agentKey 变化时重置所有标签
  useEffect(() => {
    if (prevAgentKeyRef.current !== normalizedAgentKey) {
      prevAgentKeyRef.current = normalizedAgentKey;
      tabCounterRef.current = 0;
      setTabs([]);
      setActiveTabId("");
    }
  }, [normalizedAgentKey]);

  // 挂载时自动创建首个标签页
  useEffect(() => {
    if (normalizedAgentKey && tabs.length === 0) {
      createTab();
    }
  }, [normalizedAgentKey, tabs.length, createTab]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      closeTab(tabId);
    },
    [closeTab],
  );

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
          {tabs.map((tab, i) => (
            <div
              key={tab.id}
              className={`terminal-dock-tab ${tab.id === activeTabId ? "terminal-dock-tab-active" : ""}`}
              onClick={() => setActiveTabId(tab.id)}
              role="tab"
              aria-selected={tab.id === activeTabId}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveTabId(tab.id);
                }
              }}
            >
              <span className="terminal-dock-tab-label">
                {tab.label}
                {tabs?.length > 1 ? i + 1 : null}
              </span>
              <button
                className="terminal-dock-tab-close"
                aria-label={`关闭 ${tab.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(tab.id);
                }}
                tabIndex={0}
              >
                ×
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
            agentKey={normalizedAgentKey}
            chatId={chatId}
            workspaceKey={workspaceKey}
            isActive={tab.id === activeTabId}
            themeMode={themeMode}
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
