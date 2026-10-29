import { useCallback, useRef, useState } from "react";
import type { ClipboardEvent, RefObject } from "react";
import type { TextAreaRef } from "antd/es/input/TextArea";
import {
  expandPastedText,
  insertPastedText,
  removePastedText,
  serializePastedTextDraft,
  shouldCollapsePastedText,
  updatePastedTextInput,
  type PastedTextDraft,
} from "../lib/pastedText";

interface PastedTextSnapshot {
  value: string;
  draft: PastedTextDraft;
}

interface UseComposerPastedTextInput {
  value: string;
  scopeKey: string;
  onChange: (value: string) => void;
  onFilePaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: RefObject<TextAreaRef>;
}

export function useComposerPastedText({ value, scopeKey, onChange, onFilePaste, textareaRef }: UseComposerPastedTextInput) {
  // Only presentation metadata lives here. Existing draft persistence, queueing,
  // and failed submissions keep using the full controlled string.
  const [snapshots, setSnapshots] = useState<Record<string, PastedTextSnapshot>>({});
  const snapshot = snapshots[scopeKey];
  const draft = snapshot?.value === value ? snapshot.draft : { input: value, pastes: [] };
  const selectionRef = useRef<{ value: string; start: number; end: number } | null>(null);

  const captureSelection = useCallback((event: { currentTarget: HTMLTextAreaElement }) => {
    const input = event.currentTarget;
    selectionRef.current = { value: input.value, start: input.selectionStart, end: input.selectionEnd };
  }, []);

  const commit = useCallback((next: PastedTextDraft) => {
    const nextValue = serializePastedTextDraft(next);
    setSnapshots(current => ({ ...current, [scopeKey]: { value: nextValue, draft: next } }));
    onChange(nextValue);
  }, [onChange, scopeKey]);

  const focusInput = useCallback((position?: number) => {
    window.requestAnimationFrame(() => {
      const input = textareaRef.current?.resizableTextArea?.textArea;
      input?.focus();
      if (position !== undefined) input?.setSelectionRange(position, position);
    });
  }, [textareaRef]);

  const handlePaste = useCallback((event: ClipboardEvent<HTMLTextAreaElement>) => {
    captureSelection(event);
    onFilePaste(event);
    if (event.defaultPrevented || event.clipboardData?.files?.length) return;
    const text = event.clipboardData.getData("text/plain");
    if (!shouldCollapsePastedText(text)) return;
    event.preventDefault();
    const { selectionStart, selectionEnd } = event.currentTarget;
    const id = globalThis.crypto?.randomUUID?.() ?? `paste-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    commit(insertPastedText(draft, { id, text }, selectionStart, selectionEnd));
    focusInput(selectionStart);
  }, [captureSelection, commit, draft, focusInput, onFilePaste]);

  const handleInputChange = useCallback((input: string, caret?: number) => {
    const selection = selectionRef.current?.value === draft.input ? selectionRef.current : undefined;
    selectionRef.current = null;
    if (!draft.pastes.length) onChange(input);
    else commit(updatePastedTextInput(draft, input, selection, caret));
  }, [commit, draft, onChange]);

  const removePaste = useCallback((id: string) => {
    commit(removePastedText(draft, id));
    focusInput();
  }, [commit, draft, focusInput]);

  const expandPaste = useCallback((id: string) => {
    const paste = draft.pastes.find(item => item.id === id);
    if (!paste) return;
    commit(expandPastedText(draft, id));
    focusInput(paste.offset + paste.text.length);
  }, [commit, draft, focusInput]);

  return { inputValue: draft.input, pastes: draft.pastes, captureSelection, handlePaste, handleInputChange, removePaste, expandPaste };
}
