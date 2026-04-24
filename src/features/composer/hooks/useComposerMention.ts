import { useCallback } from "react";
import type { Dispatch, SetStateAction, RefObject } from "react";
import type { TextAreaRef } from "antd/es/input/TextArea";
import type { AppAction } from "@/app/state/AppContext";
import type { AppState } from "@/app/state/types";
import { parseLeadingMentionDraft } from "@/features/composer/lib/mentionParser";
import { resolveMentionCandidatesFromState } from "@/features/composer/lib/mentionCandidates";

export function useComposerMention({
  dispatch,
  setInputValue,
  setSlashDismissed,
  state,
  textareaRef,
}: {
  dispatch: Dispatch<AppAction>;
  setInputValue: Dispatch<SetStateAction<string>>;
  setSlashDismissed: Dispatch<SetStateAction<boolean>>;
  state: AppState;
  textareaRef: RefObject<TextAreaRef>;
}) {
  const closeMention = useCallback(() => {
    dispatch({ type: "SET_MENTION_OPEN", open: false });
    dispatch({ type: "SET_MENTION_SUGGESTIONS", agents: [] });
    dispatch({ type: "SET_MENTION_ACTIVE_INDEX", index: 0 });
  }, [dispatch]);

  const updateMentionSuggestions = useCallback(
    (value: string) => {
      const draft = parseLeadingMentionDraft(value);
      if (!draft) {
        closeMention();
        return;
      }

      const query = String(draft.token || "").toLowerCase();
      const candidates = resolveMentionCandidatesFromState(state)
        .filter((agent) => {
          const key = String(agent.key || "").toLowerCase();
          const name = String(agent.name || "").toLowerCase();
          if (!query) return true;
          return key.includes(query) || name.includes(query);
        })
        .slice(0, 8);

      if (candidates.length === 0) {
        closeMention();
        return;
      }

      dispatch({ type: "SET_MENTION_SUGGESTIONS", agents: candidates });
      dispatch({ type: "SET_MENTION_ACTIVE_INDEX", index: 0 });
      dispatch({ type: "SET_MENTION_OPEN", open: true });
    },
    [closeMention, dispatch, state],
  );

  const selectMentionByIndex = useCallback(
    (index: number) => {
      const target = state.mentionSuggestions[index];
      if (!target) return;
      const displayLabel = String(target.name || "").trim() || target.key;
      const next = `@${displayLabel} `;
      setInputValue(next);
      setSlashDismissed(false);
      closeMention();
      window.requestAnimationFrame(() => {
        const el = textareaRef.current?.resizableTextArea?.textArea;
        if (!el) return;
        el.focus();
        const caret = next.length;
        el.setSelectionRange(caret, caret);
      });
    },
    [closeMention, setInputValue, setSlashDismissed, state.mentionSuggestions, textareaRef],
  );

  return {
    closeMention,
    selectMentionByIndex,
    updateMentionSuggestions,
  };
}
