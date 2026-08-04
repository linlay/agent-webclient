import { useCallback } from "react";
import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { SlashPaletteItem } from "@/features/composer/lib/slashCommands";
import { isImeEnterConfirming } from "@/shared/utils/ime";

export function useComposerKeyboard({
  closeMention,
  dispatch,
  onSelectSlashItem,
  handleSend,
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
}: {
  closeMention: () => void;
  dispatch: Dispatch<AppAction>;
  onSelectSlashItem: (item: SlashPaletteItem) => void;
  handleSend: () => void;
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
    ],
  );
}
