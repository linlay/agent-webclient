import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MaterialIcon } from "@/shared/icons/material";
import styles from "./ConversationFileDrop.module.css";

// Shells with a conversation column draw the hint over that column. Route
// shells without one (the standalone agent page) mark their root so the hint
// still covers a real drop surface instead of only the composer frame.
const SURFACE_HOST_SELECTOR = ".app-shell-center, [data-file-drop-surface]";
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
// Nested surfaces (column, message area, composer frame) all see the same drop.
// The innermost one uploads; the enclosing ones only clear their own highlight.
const handledDropEvents = new WeakSet<Event>();

interface FileDropReceiver {
  enabled: boolean;
  resetKey: string;
  onDrop: React.DragEventHandler<HTMLElement>;
}

const FileDropContext = createContext<{
  receiver: FileDropReceiver | null;
  activeSurfaces: ReadonlySet<symbol>;
  setSurfaceActive: (key: symbol, active: boolean) => void;
  setReceiver: React.Dispatch<React.SetStateAction<FileDropReceiver | null>>;
} | null>(null);

const EMPTY_RECEIVER: FileDropReceiver = { enabled: false, resetKey: "", onDrop: () => {} };

export function ConversationFileDropProvider({ children }: React.PropsWithChildren) {
  const [receiver, setReceiver] = useState<FileDropReceiver | null>(null);
  // Several surfaces (conversation column, message area, composer frame) can be
  // dragged over at once; the hint stays on while any of them is active.
  const [activeSurfaces, setActiveSurfaces] = useState<ReadonlySet<symbol>>(() => new Set());
  const setSurfaceActive = useCallback((key: symbol, active: boolean) => {
    setActiveSurfaces(current => {
      if (current.has(key) === active) return current;
      const next = new Set(current);
      if (active) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  return <FileDropContext.Provider value={{ receiver, setReceiver, activeSurfaces, setSurfaceActive }}>{children}</FileDropContext.Provider>;
}

export function useConversationFileDropReceiver(receiver: FileDropReceiver) {
  const context = useContext(FileDropContext);
  const setReceiver = context?.setReceiver;
  const { enabled, resetKey, onDrop } = receiver;
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const forwardDrop = useCallback<React.DragEventHandler<HTMLElement>>(event => onDropRef.current(event), []);
  useEffect(() => {
    if (!setReceiver) return;
    const current = { enabled, resetKey, onDrop: forwardDrop };
    setReceiver(current);
    return () => setReceiver(value => value === current ? null : value);
  }, [enabled, resetKey, forwardDrop, setReceiver]);
  return (context?.activeSurfaces.size ?? 0) > 0;
}

export function useFileDropTarget({ enabled, resetKey, onDrop }: FileDropReceiver) {
  const [active, setActiveState] = useState(false);
  // Mirrors `active` so resets that change nothing (mount, a drag that never
  // entered, a nested surface leaving) do not schedule a render.
  const activeRef = useRef(false);
  const setActive = useCallback((next: boolean) => {
    if (activeRef.current === next) return;
    activeRef.current = next;
    setActiveState(next);
  }, []);
  const depth = useRef(0);
  const reset = useCallback(() => {
    depth.current = 0;
    setActive(false);
  }, [setActive]);
  useEffect(reset, [enabled, resetKey, reset]);
  useEffect(() => {
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("dragend", reset);
      window.removeEventListener("drop", reset);
      window.removeEventListener("blur", reset);
    };
  }, [reset]);
  const isFileDrag = (event: React.DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");
  return {
    active: active && enabled,
    handlers: {
      onDragEnter(event: React.DragEvent<HTMLElement>) {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        depth.current += 1;
        setActive(enabled);
      },
      onDragOver(event: React.DragEvent<HTMLElement>) {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = enabled ? "copy" : "none";
      },
      onDragLeave(event: React.DragEvent<HTMLElement>) {
        if (!isFileDrag(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setActive(false);
      },
      onDrop(event: React.DragEvent<HTMLElement>) {
        reset();
        if (!isFileDrag(event) && !event.dataTransfer.files.length) return;
        event.preventDefault();
        // Keep bubbling so enclosing surfaces reset too; only the innermost
        // enabled surface forwards the files to the receiver.
        if (!enabled) return;
        const nativeEvent = event.nativeEvent;
        if (nativeEvent && handledDropEvents.has(nativeEvent)) return;
        if (nativeEvent) handledDropEvents.add(nativeEvent);
        onDrop(event);
      },
    },
  };
}

export function useConversationFileDropTarget() {
  const context = useContext(FileDropContext);
  const target = useFileDropTarget(context?.receiver ?? EMPTY_RECEIVER);
  const [surfaceKey] = useState(() => Symbol("file-drop-surface"));
  const setSurfaceActive = context?.setSurfaceActive;
  useEffect(() => {
    // An inactive surface has nothing to publish, and dispatching on mount would
    // dirty the receiver state for every shell that only renders a drop target.
    if (!target.active) return;
    setSurfaceActive?.(surfaceKey, true);
    return () => setSurfaceActive?.(surfaceKey, false);
  }, [target.active, setSurfaceActive, surfaceKey]);
  return target;
}

/**
 * Resolves the element that owns a drop anchor (the conversation column, or the
 * marked root of a shell without one), so the drop hint can cover that whole
 * surface instead of only the composer frame. Resolution runs when a drag
 * becomes active because the anchor may mount late (awaiting shells render
 * before the composer) and the host may change on remount.
 */
export function useFileDropSurfaceHost(
  anchorRef: React.RefObject<HTMLElement>,
  active: boolean,
) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useIsomorphicLayoutEffect(() => {
    if (!active) {
      setHost(null);
      return;
    }
    setHost(anchorRef.current?.closest<HTMLElement>(SURFACE_HOST_SELECTOR) ?? null);
  }, [active, anchorRef]);
  return host;
}

export function FileDropOverlay({ title, hint, variant = "field" }: {
  title: string; hint: string; variant?: "field" | "surface";
}) {
  if (variant === "surface") {
    return <div className={styles.surface} aria-hidden="true">
      <div className={styles.surfaceZone}>
        <strong className={styles.surfaceTitle}>{title}</strong>
        <span className={styles.surfaceHint}>{hint}</span>
      </div>
    </div>;
  }
  return <div className={styles.overlay} aria-hidden="true">
    <MaterialIcon name="upload" className={styles.icon} />
    <span className={styles.title}>{title}</span>
    <span className={styles.hint}>{hint}</span>
  </div>;
}
