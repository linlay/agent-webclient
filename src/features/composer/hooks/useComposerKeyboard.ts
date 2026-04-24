import { useCallback } from "react";
import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { SlashCommandId } from "@/features/composer/lib/slashCommands";
import { isImeEnterConfirming } from "@/shared/utils/ime";

export function useComposerKeyboard({
  closeMention,
  dispatch,
  executeSlashCommand,
  handleSend,
  isComposingRef,
  isVoiceMode,
  mentionActiveIndex,
  mentionOpen,
  mentionSuggestionsLength,
  selectMentionByIndex,
  selectSlashCommand,
  setActiveSlashIndex,
  setSlashDismissed,
  showSlashPalette,
  slashCommandsLength,
}: {
  closeMention: () => void;
  dispatch: Dispatch<AppAction>;
  executeSlashCommand: (commandId: SlashCommandId) => Promise<void>;
  handleSend: () => void;
  isComposingRef: RefObject<boolean>;
  isVoiceMode: boolean;
  mentionActiveIndex: number;
  mentionOpen: boolean;
  mentionSuggestionsLength: number;
  selectMentionByIndex: (index: number) => void;
  selectSlashCommand: () => { id: SlashCommandId } | null;
  setActiveSlashIndex: Dispatch<SetStateAction<number>>;
  setSlashDismissed: Dispatch<SetStateAction<boolean>>;
  showSlashPalette: boolean;
  slashCommandsLength: number;
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

      if (showSlashPalette) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveSlashIndex((current) => (current + 1) % slashCommandsLength);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveSlashIndex(
            (current) => (current - 1 + slashCommandsLength) % slashCommandsLength,
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
          const selected = selectSlashCommand();
          if (selected) {
            void executeSlashCommand(selected.id);
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
      dispatch,
      executeSlashCommand,
      handleSend,
      isComposingRef,
      isVoiceMode,
      mentionActiveIndex,
      mentionOpen,
      mentionSuggestionsLength,
      selectMentionByIndex,
      selectSlashCommand,
      setActiveSlashIndex,
      setSlashDismissed,
      showSlashPalette,
      slashCommandsLength,
    ],
  );
}
