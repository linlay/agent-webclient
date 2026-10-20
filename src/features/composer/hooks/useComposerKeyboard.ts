import { useCallback } from "react";
import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { SlashPaletteItem } from "@/features/composer/lib/slashCommands";
import { isImeEnterConfirming } from "@/shared/utils/ime";

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

export function useComposerKeyboard({
  closeMention,
  dispatch,
  onSelectSlashItem,
  handleSend,
  onSubmitQueuedSteer,
  onTogglePlanningMode,
  canUsePlanningMode,
  isComposingRef,
  isVoiceMode,
  mentionActiveIndex,
  mentionOpen,
  mentionSuggestionsLength,
  selectMentionByIndex,
  selectSlashItem,
  setActiveSlashIndex,
  setSlashDismissed,
  showSlashPalette,
  slashItemsLength,
  onHistoryPrevious,
  onHistoryNext,
}: {
  closeMention: () => void;
  dispatch: Dispatch<AppAction>;
  onSelectSlashItem: (item: SlashPaletteItem) => void;
  handleSend: () => void;
  onSubmitQueuedSteer?: () => void;
  onTogglePlanningMode: () => void;
  canUsePlanningMode: boolean;
  isComposingRef: RefObject<boolean>;
  isVoiceMode: boolean;
  mentionActiveIndex: number;
  mentionOpen: boolean;
  mentionSuggestionsLength: number;
  selectMentionByIndex: (index: number) => void;
  selectSlashItem: () => SlashPaletteItem | null;
  setActiveSlashIndex: Dispatch<SetStateAction<number>>;
  setSlashDismissed: Dispatch<SetStateAction<boolean>>;
  showSlashPalette: boolean;
  slashItemsLength: number;
  onHistoryPrevious?: () => void;
  onHistoryNext?: () => void;
}) {
  return useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (isVoiceMode) {
        event.preventDefault();
        return;
      }
      if (isImeEnterConfirming(event, Boolean(isComposingRef.current))) {
        return;
      }

      const isMac = isMacPlatform();
      const isModifier = isMac
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey;

      if (event.key === "Enter" && isModifier && !event.shiftKey && !event.altKey && onSubmitQueuedSteer) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) onSubmitQueuedSteer();
        return;
      }

      if (event.key === "Tab" && event.shiftKey) {
        if (!canUsePlanningMode) {
          return;
        }
        event.preventDefault();
        onTogglePlanningMode();
        return;
      }

      if (showSlashPalette) {
        if (event.key === "ArrowDown" && slashItemsLength > 0) {
          event.preventDefault();
          setActiveSlashIndex((current) => (current + 1) % slashItemsLength);
          return;
        }
        if (event.key === "ArrowUp" && slashItemsLength > 0) {
          event.preventDefault();
          setActiveSlashIndex(
            (current) => (current - 1 + slashItemsLength) % slashItemsLength,
          );
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setSlashDismissed(true);
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          const selected = selectSlashItem();
          if (selected) {
            onSelectSlashItem(selected);
          }
          return;
        }
      }

      if (mentionOpen && mentionSuggestionsLength > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          dispatch({
            type: "SET_MENTION_ACTIVE_INDEX",
            index: (mentionActiveIndex + 1) % mentionSuggestionsLength,
          });
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          dispatch({
            type: "SET_MENTION_ACTIVE_INDEX",
            index:
              (mentionActiveIndex - 1 + mentionSuggestionsLength) %
              mentionSuggestionsLength,
          });
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeMention();
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          selectMentionByIndex(mentionActiveIndex);
          return;
        }
      }

      // 历史文案上下翻阅：仅在无 slash / mention 弹窗时生效，
      // 且光标必须位于首行（上键）或末行（下键），避免抢占多行文本内的光标移动。
      if (event.key === "ArrowUp" && onHistoryPrevious) {
        const el = event.currentTarget;
        const beforeCursor = el.value.slice(0, el.selectionStart ?? el.value.length);
        if (!beforeCursor.includes("\n")) {
          event.preventDefault();
          onHistoryPrevious();
          return;
        }
      }
      if (event.key === "ArrowDown" && onHistoryNext) {
        const el = event.currentTarget;
        const afterCursor = el.value.slice(el.selectionEnd ?? el.value.length);
        if (!afterCursor.includes("\n")) {
          event.preventDefault();
          onHistoryNext();
          return;
        }
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    },
    [
      closeMention,
      canUsePlanningMode,
      dispatch,
      onSelectSlashItem,
      handleSend,
      onSubmitQueuedSteer,
      onTogglePlanningMode,
      isComposingRef,
      isVoiceMode,
      mentionActiveIndex,
      mentionOpen,
      mentionSuggestionsLength,
      selectMentionByIndex,
      selectSlashItem,
      setActiveSlashIndex,
      setSlashDismissed,
      showSlashPalette,
      slashItemsLength,
      onHistoryPrevious,
      onHistoryNext,
    ],
  );
}
