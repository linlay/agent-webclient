import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch } from "@/app/state/AppContext";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { TerminalWorkspace } from "@/features/terminal/components/TerminalWorkspace";
import { resolveTerminalDockWorkspaceKey } from "@/features/terminal/lib/terminalWorkspace";
import { resolveTerminalTheme } from "@/features/terminal/lib/terminalTheme";
import { useI18n } from "@/shared/i18n";

export { resolveTerminalDockWorkspaceKey, resolveTerminalTheme };

export const TerminalDock: React.FC<{
  agentKey: string;
  workspaceKey?: string;
  worker?: CurrentWorkerSummary | null;
}> = ({ agentKey, workspaceKey = "", worker = null }) => {
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const [height, setHeight] = useState(250);
  const resizingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(250);

  const startResize = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    resizingRef.current = true;
    startYRef.current = event.clientY;
    startHeightRef.current = height;
  }, [height]);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!resizingRef.current) return;
      setHeight(Math.max(80, Math.min(window.innerHeight * 0.7, startHeightRef.current + startYRef.current - event.clientY)));
    };
    const stop = () => { resizingRef.current = false; };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", stop);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", stop);
    };
  }, []);

  return (
    <section className="terminal-dock" aria-label={t("terminal.panelAria")} style={{ height }}>
      <div className="terminal-dock-resize-handle" onMouseDown={startResize} />
      <TerminalWorkspace
        agentKey={agentKey}
        workspaceKey={workspaceKey}
        worker={worker}
        onRequestClose={() => dispatch({ type: "SET_TERMINAL_DOCK_OPEN", open: false })}
      />
    </section>
  );
};
