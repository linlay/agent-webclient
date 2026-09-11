import React, { useRef, useState } from "react";
import { useAppDispatch } from "@/app/state/AppContext";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { TerminalWorkspace } from "@/features/terminal/components/TerminalWorkspace";
import { resolveTerminalDockWorkspaceKey } from "@/features/terminal/lib/terminalWorkspace";
import { resolveTerminalTheme } from "@/features/terminal/lib/terminalTheme";
import { useI18n } from "@/shared/i18n";
import { usePanelResize } from "@/shared/ui/usePanelResize";
import styles from "./TerminalDock.module.css";

export { resolveTerminalDockWorkspaceKey, resolveTerminalTheme };

export const TerminalDock: React.FC<{
  agentKey: string;
  workspaceKey?: string;
  worker?: CurrentWorkerSummary | null;
}> = ({ agentKey, workspaceKey = "", worker = null }) => {
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const [height, setHeight] = useState(250);
  const startHeightRef = useRef(250);

  const { handlePointerDown: startResize } = usePanelResize({
    axis: "vertical",
    invert: true,
    onResizeStart: () => {
      startHeightRef.current = height;
    },
    onResize: (delta) =>
      setHeight(
        Math.max(
          80,
          Math.min(window.innerHeight * 0.7, startHeightRef.current + delta),
        ),
      ),
  });

  return (
    <section className={`terminal-dock ${styles["terminal-dock"]}`} aria-label={t("terminal.panelAria")} style={{ height }}>
      <div
        className={`terminal-dock-resize-handle ${styles["terminal-dock-resize-handle"]}`}
        onPointerDown={startResize}
      />
      <TerminalWorkspace
        agentKey={agentKey}
        workspaceKey={workspaceKey}
        worker={worker}
        onRequestClose={() => dispatch({ type: "SET_TERMINAL_DOCK_OPEN", open: false })}
      />
    </section>
  );
};
