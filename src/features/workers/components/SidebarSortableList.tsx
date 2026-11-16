import React, { Fragment, useContext, useRef, useState } from "react";
import { SidebarTouchContext } from "./SidebarTouchContext";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import styles from "./SidebarSortableList.module.css";

export type SidebarDragProps = React.HTMLAttributes<HTMLElement>;

/** Bind to the existing row (project headers only), without adding a handle. */
export function SidebarSortableList<T>({ items, getId, onMove, renderItem }: {
  items: T[];
  getId: (item: T) => string;
  onMove: (ids: string[], active: string, target: string, after: boolean) => void;
  renderItem: (item: T, drag: SidebarDragProps) => React.ReactNode;
}) {
  const touchSorting = useContext(SidebarTouchContext);
  const { t } = useI18n();
  const active = useRef<string | null>(null);
  const suppressClick = useRef(false);
  const blockedDrag = useRef(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; after: boolean } | null>(null);
  const clear = () => { active.current = null; setDragging(null); setTarget(null); };
  return <>{items.map((item, index) => {
    const id = getId(item);
    const row = renderItem(item, {
      draggable: true,
      className: [styles.row, dragging === id ? styles.dragging : "", target?.id === id ? target.after ? styles.after : styles.before : ""].filter(Boolean).join(" "),
      onPointerDownCapture: event => {
        suppressClick.current = false;
        blockedDrag.current = Boolean((event.target as HTMLElement).closest('[aria-haspopup="menu"], .ui-btn, input, select, textarea'));
      },
      onClickCapture: event => {
        if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
      },
      onDragStart: event => {
        // More/new-chat controls remain clickable and cannot initiate a row drag.
        if (blockedDrag.current || (event.target as HTMLElement).closest('[aria-haspopup="menu"], .ui-btn, input, select, textarea')) {
          event.preventDefault(); return;
        }
        event.stopPropagation();
        active.current = id;
        suppressClick.current = true;
        setDragging(id);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-agent-sidebar-row", id);
        event.dataTransfer.setDragImage(event.currentTarget, 20, 16);
      },
      onDragOver: event => {
        if (!active.current || active.current === id) return;
        event.preventDefault(); event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        const rect = event.currentTarget.getBoundingClientRect();
        setTarget({ id, after: event.clientY > rect.top + rect.height / 2 });
      },
      onDragLeave: event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTarget(null);
      },
      onDrop: event => {
        if (!active.current) return;
        event.preventDefault(); event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        onMove(items.map(getId), active.current, id, event.clientY > rect.top + rect.height / 2);
        clear();
      },
      onDragEnd: event => { event.stopPropagation(); clear(); },
      onKeyDownCapture: event => {
        suppressClick.current = false;
        if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
        const index = items.findIndex(entry => getId(entry) === id);
        const next = items[index + (event.key === "ArrowDown" ? 1 : -1)];
        event.preventDefault(); event.stopPropagation();
        if (next) onMove(items.map(getId), id, getId(next), event.key === "ArrowDown");
      },
    });
    return <Fragment key={id}>{touchSorting ? <div className={styles.touchRow}>
      <div className={styles.touchContent}>{row}</div>
      <div className={styles.touchActions}>
        <button type="button" disabled={index === 0} aria-label={t("mobile.moveUp")}
          onClick={() => onMove(items.map(getId), id, getId(items[index - 1]), false)}><MaterialIcon name="arrow_upward" /></button>
        <button type="button" disabled={index === items.length - 1} aria-label={t("mobile.moveDown")}
          onClick={() => onMove(items.map(getId), id, getId(items[index + 1]), true)}><MaterialIcon name="arrow_downward" /></button>
      </div>
    </div> : row}</Fragment>;
  })}</>;
}
