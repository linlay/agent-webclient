import { useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { TextAreaRef } from "antd/es/input/TextArea";
import type { AppAction } from "@/app/state/AppContext";

export function useComposerLifecycle({
  applyComposerDraft,
  chatId,
  closeMention,
  dispatch,
  isFrontendActive,
  isVoiceMode,
  mergedSteerDraft,
  setInputValue,
  setSlashDismissed,
  stopSpeechInput,
  textareaRef,
  updateMentionSuggestions,
}: {
  applyComposerDraft: (draft: string) => void;
  chatId: string;
  closeMention: () => void;
  dispatch: Dispatch<AppAction>;
  isFrontendActive: boolean;
  isVoiceMode: boolean;
  mergedSteerDraft: {
    nextValue: string;
    draft: string;
    hasPendingSteers: boolean;
  } | null;
  setInputValue: Dispatch<SetStateAction<string>>;
  setSlashDismissed: Dispatch<SetStateAction<boolean>>;
  stopSpeechInput: () => void;
  textareaRef: RefObject<TextAreaRef>;
  updateMentionSuggestions: (value: string) => void;
}) {
  useEffect(() => {
    textareaRef.current?.focus();
  }, [chatId, textareaRef]);

  useEffect(() => {
    if (!isVoiceMode) return;
    closeMention();
    setSlashDismissed(true);
  }, [closeMention, isVoiceMode, setSlashDismissed]);

  useEffect(() => {
    const onFocusComposer = () => {
      window.requestAnimationFrame(() => {
        const el = textareaRef.current?.resizableTextArea?.textArea;
        if (!el) return;
        el.focus();
        const caret = el.value.length;
        el.setSelectionRange(caret, caret);
      });
    };

    window.addEventListener("agent:focus-composer", onFocusComposer);
    return () =>
      window.removeEventListener("agent:focus-composer", onFocusComposer);
  }, [textareaRef]);

  useEffect(() => {
    const onSetDraft = (event: Event) => {
      const draft = String((event as CustomEvent).detail?.draft || "");
      applyComposerDraft(draft);
    };

    window.addEventListener("agent:set-composer-draft", onSetDraft);
    return () =>
      window.removeEventListener("agent:set-composer-draft", onSetDraft);
  }, [applyComposerDraft]);

  useEffect(() => {
    const onSelectMention = (event: Event) => {
      const agentKey = String(
        (event as CustomEvent).detail?.agentKey || "",
      ).trim();
      const agentName = String(
        (event as CustomEvent).detail?.agentName || "",
      ).trim();
      if (!agentKey) return;
      const displayLabel = agentName || agentKey;
      setInputValue(`@${displayLabel} `);
      setSlashDismissed(false);
      closeMention();
    };

    window.addEventListener("agent:select-mention", onSelectMention);
    return () =>
      window.removeEventListener("agent:select-mention", onSelectMention);
  }, [closeMention, setInputValue, setSlashDismissed]);

  useEffect(() => {
    if (!isVoiceMode && !isFrontendActive) return;
    stopSpeechInput();
  }, [isFrontendActive, isVoiceMode, stopSpeechInput]);

  useEffect(() => {
    if (!mergedSteerDraft) {
      return;
    }
    const { nextValue, draft, hasPendingSteers } = mergedSteerDraft;
    setInputValue(nextValue);
    setSlashDismissed(false);
    updateMentionSuggestions(nextValue);
    if (draft.trim()) {
      dispatch({ type: "SET_STEER_DRAFT", draft: "" });
    }
    if (hasPendingSteers) {
      dispatch({ type: "CLEAR_PENDING_STEERS" });
    }
    window.requestAnimationFrame(() => {
      const el = textareaRef.current?.resizableTextArea?.textArea;
      if (!el) return;
      el.focus();
      const caret = nextValue.length;
      el.setSelectionRange(caret, caret);
    });
  }, [
    dispatch,
    mergedSteerDraft,
    setInputValue,
    setSlashDismissed,
    textareaRef,
    updateMentionSuggestions,
  ]);
}

