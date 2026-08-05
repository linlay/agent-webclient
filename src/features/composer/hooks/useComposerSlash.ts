import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  getFilteredSlashCommands,
  getFilteredSlashSkills,
  shouldShowSlashCommandPalette,
  type SlashPaletteItem,
} from "@/features/composer/lib/slashCommands";
import { useAgentSkillsQuery } from "@/shared/data/query/queries";

interface UseComposerSlashInput {
  composerPillRef: RefObject<HTMLDivElement>;
  composerRef: RefObject<HTMLDivElement>;
  inputValue: string;
  isAwaitingActive: boolean;
  isFrontendActive: boolean;
  isVoiceMode: boolean;
  commandOverlayOpen: boolean;
  canUsePlanningMode: boolean;
  canUseEditingMode: boolean;
  currentAgentKey: string;
  addMenuOpen: boolean;
}

export function useComposerSlash(input: UseComposerSlashInput) {
  const {
    composerPillRef,
    composerRef,
    inputValue,
    isAwaitingActive,
    isFrontendActive,
    isVoiceMode,
    commandOverlayOpen,
    canUsePlanningMode,
    canUseEditingMode,
    currentAgentKey,
    addMenuOpen,
  } = input;
  const slashPaletteRef = useRef<HTMLDivElement>(null);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [activeSlashIndex, setActiveSlashIndex] = useState(0);
  const [slashPopoverWidth, setSlashPopoverWidth] = useState<number>();
  const slashTokenActive = shouldShowSlashCommandPalette(inputValue);
  const skillQueryEnabled =
    Boolean(String(currentAgentKey || "").trim()) &&
    slashTokenActive &&
    !isVoiceMode &&
    !isFrontendActive &&
    !isAwaitingActive &&
    !commandOverlayOpen &&
    !addMenuOpen &&
    !slashDismissed;
  const skillQuery = useAgentSkillsQuery(currentAgentKey, {
    enabled: skillQueryEnabled,
  });
  const hasSkillSection = Boolean(String(currentAgentKey || "").trim());

  const slashCommands = useMemo(
    () =>
      getFilteredSlashCommands(inputValue, {
        canUsePlanningMode,
        canUseEditingMode,
      }),
    [canUseEditingMode, canUsePlanningMode, inputValue],
  );
  const slashSkills = useMemo(
    () =>
      getFilteredSlashSkills(
        inputValue,
        hasSkillSection ? skillQuery.data?.skills || [] : [],
      ),
    [hasSkillSection, inputValue, skillQuery.data],
  );
  const slashItems = useMemo<SlashPaletteItem[]>(
    () => [...slashCommands, ...slashSkills],
    [slashCommands, slashSkills],
  );
  const showSlashPalette =
    !isVoiceMode &&
    !isFrontendActive &&
    !isAwaitingActive &&
    !commandOverlayOpen &&
    !addMenuOpen &&
    !slashDismissed &&
    slashTokenActive &&
    (slashItems.length > 0 || hasSkillSection);

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
    if (activeSlashIndex >= slashItems.length) {
      setActiveSlashIndex(0);
    }
  }, [activeSlashIndex, showSlashPalette, slashItems.length]);

  const selectSlashItem = (
    index = activeSlashIndex,
  ): SlashPaletteItem | null => {
    return slashItems[index] || slashItems[0] || null;
  };

  return {
    activeSlashIndex,
    refetchSlashSkills: skillQuery.refetch,
    selectSlashItem,
    setActiveSlashIndex,
    setSlashDismissed,
    showSlashPalette,
    slashCommands,
    slashItems,
    slashSkillError: skillQuery.error,
    slashSkillStatus: hasSkillSection ? skillQuery.status : "idle",
    slashSkills,
    slashDismissed,
    slashPaletteRef,
    slashPopoverWidth,
  };
}
