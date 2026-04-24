import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  getFilteredSlashCommands,
  type ResolvedSlashCommandDefinition,
} from "@/features/composer/lib/slashCommands";

interface UseComposerSlashInput {
  composerPillRef: RefObject<HTMLDivElement>;
  composerRef: RefObject<HTMLDivElement>;
  inputValue: string;
  isAwaitingActive: boolean;
  isFrontendActive: boolean;
  isVoiceMode: boolean;
  commandModalOpen: boolean;
}

export function useComposerSlash(input: UseComposerSlashInput) {
  const {
    composerPillRef,
    composerRef,
    inputValue,
    isAwaitingActive,
    isFrontendActive,
    isVoiceMode,
    commandModalOpen,
  } = input;
  const slashPaletteRef = useRef<HTMLDivElement>(null);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [activeSlashIndex, setActiveSlashIndex] = useState(0);
  const [slashPopoverWidth, setSlashPopoverWidth] = useState<number>();

  const slashCommands = useMemo(
    () => getFilteredSlashCommands(inputValue),
    [inputValue],
  );
  const showSlashPalette =
    !isVoiceMode &&
    !isFrontendActive &&
    !isAwaitingActive &&
    !commandModalOpen &&
    !slashDismissed &&
    slashCommands.length > 0;

  useEffect(() => {
    const anchor = composerPillRef.current;
    if (!anchor) return;

    const updateSlashPopoverWidth = () => {
      const nextWidth = anchor.offsetWidth;
      setSlashPopoverWidth(nextWidth > 0 ? nextWidth : undefined);
    };
    updateSlashPopoverWidth();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        updateSlashPopoverWidth();
      });
      observer.observe(anchor);
      return () => {
        observer.disconnect();
      };
    }

    window.addEventListener("resize", updateSlashPopoverWidth);
    return () => {
      window.removeEventListener("resize", updateSlashPopoverWidth);
    };
  }, [composerPillRef]);

  useEffect(() => {
    if (!showSlashPalette) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        !composerRef.current?.contains(target) &&
        !slashPaletteRef.current?.contains(target)
      ) {
        setSlashDismissed(true);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSlashDismissed(true);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [composerRef, showSlashPalette]);

  useEffect(() => {
    if (!showSlashPalette) {
      setActiveSlashIndex(0);
      return;
    }
    if (activeSlashIndex >= slashCommands.length) {
      setActiveSlashIndex(0);
    }
  }, [activeSlashIndex, showSlashPalette, slashCommands.length]);

  const selectSlashCommand = (
    index = activeSlashIndex,
  ): ResolvedSlashCommandDefinition | null => {
    return slashCommands[index] || slashCommands[0] || null;
  };

  return {
    activeSlashIndex,
    selectSlashCommand,
    setActiveSlashIndex,
    setSlashDismissed,
    showSlashPalette,
    slashCommands,
    slashDismissed,
    slashPaletteRef,
    slashPopoverWidth,
  };
}
