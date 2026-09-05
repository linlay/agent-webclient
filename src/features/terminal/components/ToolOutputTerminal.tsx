import React, { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import type { ToolOutputState } from "@/app/state/types";
import {
  TOOL_OUTPUT_MAX_BYTES,
  toolOutputText,
} from "@/features/events/lib/toolOutputState";
import { resolveTerminalTheme } from "@/features/terminal/lib/terminalTheme";
import {
  resolveToolOutputTerminalRows,
  resolveToolOutputWritePlan,
} from "@/features/terminal/lib/toolOutputTerminal";
import "@xterm/xterm/css/xterm.css";

const DEFAULT_COLUMNS = 80;
const INITIAL_ROWS = 1;
const FALLBACK_ROW_HEIGHT_PX = 18;

export interface ToolOutputTerminalProps {
  readonly output: ToolOutputState;
  readonly themeMode: string;
}

function measureRowHeight(terminal: Terminal): number {
  const screen = terminal.element?.querySelector<HTMLElement>(".xterm-screen");
  const height = screen?.getBoundingClientRect().height || 0;
  return height > 0
    ? height / Math.max(1, terminal.rows)
    : FALLBACK_ROW_HEIGHT_PX;
}

export const ToolOutputTerminal: React.FC<ToolOutputTerminalProps> = ({
  output,
  themeMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const desiredTextRef = useRef(toolOutputText(output));
  const appliedTextRef = useRef("");
  const writingRef = useRef(false);
  const disposedRef = useRef(false);
  const rowHeightRef = useRef(FALLBACK_ROW_HEIGHT_PX);
  const lastWidthRef = useRef(0);
  const pumpRef = useRef<() => void>(() => undefined);
  desiredTextRef.current = toolOutputText(output);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    disposedRef.current = false;
    const terminal = new Terminal({
      cols: DEFAULT_COLUMNS,
      rows: INITIAL_ROWS,
      convertEol: true,
      cursorBlink: false,
      cursorInactiveStyle: "none",
      disableStdin: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 12,
      lineHeight: 1.5,
      scrollback: TOOL_OUTPUT_MAX_BYTES,
      theme: resolveTerminalTheme(themeMode),
    });
    const fitAddon = new FitAddon();
    terminalRef.current = terminal;
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    rowHeightRef.current = measureRowHeight(terminal);

    const syncLayout = () => {
      if (disposedRef.current) return;
      const width = container.getBoundingClientRect().width;
      if (width > 0 && width !== lastWidthRef.current) {
        lastWidthRef.current = width;
        try {
          const dimensions = fitAddon.proposeDimensions();
          const columns = Math.max(
            1,
            dimensions?.cols || terminal.cols || DEFAULT_COLUMNS,
          );
          if (columns !== terminal.cols) {
            terminal.resize(columns, terminal.rows);
          }
        } catch {
          // Keep the current terminal dimensions when the container is between layouts.
        }
      }

      const rows = resolveToolOutputTerminalRows(terminal);
      if (rows !== terminal.rows) {
        terminal.resize(terminal.cols, rows);
      }
      container.style.height = `${Math.ceil(rows * rowHeightRef.current)}px`;
      terminal.scrollToBottom();
    };

    const pump = () => {
      if (disposedRef.current || writingRef.current) return;
      const desiredText = desiredTextRef.current;
      const plan = resolveToolOutputWritePlan(
        appliedTextRef.current,
        desiredText,
      );
      if (plan.mode === "noop") {
        syncLayout();
        return;
      }
      if (plan.mode === "reset") {
        terminal.reset();
      }

      writingRef.current = true;
      terminal.write(plan.text, () => {
        if (disposedRef.current) return;
        appliedTextRef.current = desiredText;
        writingRef.current = false;
        syncLayout();
        if (desiredTextRef.current !== appliedTextRef.current) {
          pump();
        }
      });
    };
    pumpRef.current = pump;

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver((entries) => {
        const width = entries[entries.length - 1]?.contentRect.width || 0;
        if (width > 0 && width !== lastWidthRef.current) syncLayout();
      });
      resizeObserver.observe(container);
    }

    pump();

    return () => {
      disposedRef.current = true;
      resizeObserver?.disconnect();
      pumpRef.current = () => undefined;
      writingRef.current = false;
      appliedTextRef.current = "";
      terminal.dispose();
      if (terminalRef.current === terminal) terminalRef.current = null;
    };
    // The terminal is intentionally created once; later theme and output changes
    // are handled by the effects below without discarding terminal state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal) terminal.options.theme = resolveTerminalTheme(themeMode);
  }, [themeMode]);

  useEffect(() => {
    pumpRef.current();
  }, [output]);

  return (
    <div className="tool-output-terminal-shell">
      <div
        ref={containerRef}
        className="tool-output-terminal"
        data-chunk-index={output.lastChunkIndex}
        data-truncated={output.truncated ? "true" : "false"}
        role="log"
      />
    </div>
  );
};
