import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  getFilteredSlashCommands,
  getFilteredSlashSkills,
  getFilteredSlashPackages,
  shouldShowSlashCommandPalette,
  type SlashPaletteItem,
} from "@/features/composer/lib/slashCommands";
import { getSlashPopoverMaxHeight } from "@/features/composer/lib/slashPaletteLayout";
import { useComposerSkillMenuQuery } from "@/features/composer/hooks/useComposerSkillMenuQuery";
import { useComposerFilter } from "@/features/composer/hooks/useComposerFilter";
import { sortPinnedSkills } from "@/features/composer/lib/pinnedSkills";

// 浮层高度要在绘制前压回可视区，SSR/无 DOM 环境退回 useEffect。
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

interface UseComposerSlashInput {
  composerPillRef: RefObject<HTMLDivElement>;
  composerRef: RefObject<HTMLDivElement>;
  /** ComposerPopover 的触发节点（composer-stack），其顶边即浮层底边。 */
  composerStackRef: RefObject<HTMLDivElement>;
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
    composerStackRef,
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
  const [slashPopoverMaxHeight, setSlashPopoverMaxHeight] = useState<number>();
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
  const skillQuery = useComposerSkillMenuQuery(currentAgentKey, {
    enabled: skillQueryEnabled,
  });
  const hasSkillSection = Boolean(String(currentAgentKey || "").trim());
  const { pinnedSkillIds } = skillQuery;

  // 初步显示判断（不含 items 检查），用于 useComposerFilter 记录起始位置
  const prelimShowSlash =
    !isVoiceMode &&
    !isFrontendActive &&
    !isAwaitingActive &&
    !commandOverlayOpen &&
    !addMenuOpen &&
    !slashDismissed &&
    slashTokenActive;

  const { filterText, startIndex: filterStartIndex } = useComposerFilter(
    prelimShowSlash,
    inputValue,
    inputValue.lastIndexOf("/") + 1,
  );

  const slashCommands = useMemo(
    () =>
      getFilteredSlashCommands(filterText, {
        canUsePlanningMode,
        canUseEditingMode,
      }),
    [canUseEditingMode, canUsePlanningMode, filterText],
  );
  const slashSkills = useMemo(
    () =>
      sortPinnedSkills(
        [
          ...getFilteredSlashPackages(filterText, hasSkillSection ? skillQuery.data?.packages || [] : [], skillQuery.data?.skills || []),
          ...getFilteredSlashSkills(filterText, hasSkillSection ? skillQuery.data?.skills || [] : []),
        ],
        pinnedSkillIds,
      ),
    [hasSkillSection, filterText, skillQuery.data, pinnedSkillIds],
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

  // 浮层向上展开，能用的高度 = 锚点顶边到视口顶边的距离；窗口变矮或输入框长高时重算，
  // 否则面板会顶出浏览器视口（见 slashPaletteLayout）。
  useIsomorphicLayoutEffect(() => {
    if (!showSlashPalette) {
      setSlashPopoverMaxHeight(undefined);
      return;
    }
    const anchor = composerStackRef.current;
    if (!anchor) return;

    const update = () => {
      setSlashPopoverMaxHeight(
        getSlashPopoverMaxHeight(anchor.getBoundingClientRect().top),
      );
    };
    update();

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => update());
    observer?.observe(anchor);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [composerStackRef, showSlashPalette]);

  useEffect(() => {
    const anchor = composerPillRef.current;
    if (!anchor) return;

    const updateSlashPopoverWidth = () => {
      const nextWidth = anchor.offsetWidth;
      if (nextWidth > 0) {
        setSlashPopoverWidth(nextWidth);
      }
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
  }, []);

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
    slashPopoverMaxHeight,
    slashPopoverWidth,
    filterStartIndex,
  };
}
