import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

interface UseComposerHashInput {
  composerPillRef: RefObject<HTMLDivElement>;
  composerRef: RefObject<HTMLDivElement>;
  inputValue: string;
  isAwaitingActive: boolean;
  isFrontendActive: boolean;
  isVoiceMode: boolean;
  commandOverlayOpen: boolean;
  showSlashPalette: boolean;
  /** + 按钮点击打开状态，用于 document 事件监听覆盖 */
  addMenuClickOpen: boolean;
  /** 关闭 + 按钮点击打开状态 */
  onDismissClickOpen: () => void;
}

export function useComposerHash(input: UseComposerHashInput) {
  const {
    composerPillRef,
    composerRef,
    inputValue,
    isAwaitingActive,
    isFrontendActive,
    isVoiceMode,
    commandOverlayOpen,
    showSlashPalette,
    addMenuClickOpen,
    onDismissClickOpen,
  } = input;

  const hashPaletteRef = useRef<HTMLDivElement>(null);
  const [hashDismissed, setHashDismissed] = useState(false);
  const [hashPopoverWidth, setHashPopoverWidth] = useState<number>();

  const hashTokenActive = useMemo(
    () => /^#\S*$/.test(String(inputValue || "")),
    [inputValue],
  );

  const showAddMenu =
    !isVoiceMode &&
    !isFrontendActive &&
    !isAwaitingActive &&
    !commandOverlayOpen &&
    !showSlashPalette &&
    !hashDismissed &&
    hashTokenActive;

  const isAnyAddMenuOpen = showAddMenu || addMenuClickOpen;

  // 宽度跟踪：监听 composerPill 宽度变化
  useEffect(() => {
    const anchor = composerPillRef.current;
    if (!anchor) return;

    const updateHashPopoverWidth = () => {
      const nextWidth = anchor.offsetWidth;
      setHashPopoverWidth(nextWidth > 0 ? nextWidth : undefined);
    };
    updateHashPopoverWidth();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        updateHashPopoverWidth();
      });
      observer.observe(anchor);
      return () => {
        observer.disconnect();
      };
    }

    window.addEventListener("resize", updateHashPopoverWidth);
    return () => {
      window.removeEventListener("resize", updateHashPopoverWidth);
    };
  }, [composerPillRef]);

  // 关闭逻辑：点击外部 / Escape（覆盖 # 触发和 + 按钮触发两种场景）
  useEffect(() => {
    if (!isAnyAddMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        !composerRef.current?.contains(target) &&
        !hashPaletteRef.current?.contains(target)
      ) {
        setHashDismissed(true);
        onDismissClickOpen();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setHashDismissed(true);
      onDismissClickOpen();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [composerRef, isAnyAddMenuOpen, onDismissClickOpen]);

  // 自动重置：当 # 被删除时，重置 hashDismissed
  useEffect(() => {
    if (!hashTokenActive) {
      setHashDismissed(false);
    }
  }, [hashTokenActive]);

  return {
    showAddMenu,
    hashDismissed,
    setHashDismissed,
    hashPaletteRef,
    hashPopoverWidth,
  } as const;
}
