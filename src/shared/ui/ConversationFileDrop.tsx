import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { MaterialIcon } from "@/shared/icons/material";
import styles from "./ConversationFileDrop.module.css";

interface FileDropReceiver {
  enabled: boolean;
  resetKey: string;
  onDrop: React.DragEventHandler<HTMLElement>;
}

const FileDropContext = createContext<{
  receiver: FileDropReceiver | null;
  stageActive: boolean;
  setStageActive: React.Dispatch<React.SetStateAction<boolean>>;
  setReceiver: React.Dispatch<React.SetStateAction<FileDropReceiver | null>>;
} | null>(null);

export function ConversationFileDropProvider({ children }: React.PropsWithChildren) {
  const [receiver, setReceiver] = useState<FileDropReceiver | null>(null);
  const [stageActive, setStageActive] = useState(false);
  return <FileDropContext.Provider value={{ receiver, setReceiver, stageActive, setStageActive }}>{children}</FileDropContext.Provider>;
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
  return context?.stageActive ?? false;
}

export function useFileDropTarget({ enabled, resetKey, onDrop }: FileDropReceiver) {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  const reset = useCallback(() => {
    depth.current = 0;
    setActive(false);
  }, []);
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
        event.stopPropagation();
        if (enabled) onDrop(event);
      },
    },
  };
}

export function useConversationFileDropTarget() {
  const context = useContext(FileDropContext);
  const target = useFileDropTarget(context?.receiver ?? { enabled: false, resetKey: "", onDrop: () => {} });
  const setStageActive = context?.setStageActive;
  useEffect(() => {
    setStageActive?.(target.active);
    return () => setStageActive?.(false);
  }, [target.active, setStageActive]);
  return target;
}

export function FileDropOverlay({ title, hint }: {
  title: string; hint: string;
}) {
  return <div className={styles.overlay} aria-hidden="true">
    <MaterialIcon name="upload" className={styles.icon} />
    <span className={styles.title}>{title}</span>
    <span className={styles.hint}>{hint}</span>
  </div>;
}
