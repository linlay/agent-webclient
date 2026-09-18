import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addSelectedTextFragment,
  updateSelectedTextAnnotation,
  validAnnotationIndex,
  SELECTED_TEXT_REFERENCES_ACCEPTED_EVENT,
  selectedTextReferenceToAttachment,
  type SelectedTextFragment,
} from "@/features/selection/lib/selectedTextReference";

const EMPTY_SELECTED_TEXT_FRAGMENTS: SelectedTextFragment[] = [];

type SelectionDraft = { fragments: SelectedTextFragment[]; nextIndex: number };

export function useSelectedTextFragments(chatKey: string, restoredReferences: readonly unknown[] = []) {
  const normalizedChatKey = String(chatKey || "").trim() || "__new_chat__";
  const [byChat, setByChat] = useState<Map<string, SelectionDraft>>(
    () => new Map(),
  );
  const fragments = byChat.get(normalizedChatKey)?.fragments || EMPTY_SELECTED_TEXT_FRAGMENTS;
  const restoredNextIndex = restoredReferences.reduce<number>((next, value) => {
    if (!value || typeof value !== "object") return next;
    const ref = value as { type?: string; annotationIndex?: number };
    return ref.type === "selection" ? Math.max(next, (validAnnotationIndex(ref.annotationIndex) || 0) + 1) : next;
  }, 1);

  const addFragment = useCallback((fragment: SelectedTextFragment) => {
    setByChat((current) => {
      const draft = current.get(normalizedChatKey) || { fragments: [], nextIndex: 1 };
      const previous = draft.fragments;
      const nextFragments = addSelectedTextFragment(previous, fragment, Math.max(draft.nextIndex, restoredNextIndex));
      if (nextFragments.length === previous.length) return current;
      const next = new Map(current);
      next.set(normalizedChatKey, { fragments: nextFragments, nextIndex: nextFragments[nextFragments.length - 1].reference.annotationIndex! + 1 });
      return next;
    });
    return true;
  }, [normalizedChatKey, restoredNextIndex]);

  const updateAnnotation = useCallback((referenceId: string, annotation: string) => {
    setByChat(current => {
      const next = new Map(current);
      const draft = current.get(normalizedChatKey);
      if (!draft) return current;
      next.set(normalizedChatKey, { ...draft, fragments: updateSelectedTextAnnotation(draft.fragments, referenceId, annotation) });
      return next;
    });
  }, [normalizedChatKey]);

  const removeFragment = useCallback((referenceId: string) => {
    setByChat((current) => {
      const draft = current.get(normalizedChatKey);
      if (!draft) return current;
      const previous = draft.fragments;
      const nextFragments = previous.filter(
        (fragment) => fragment.reference.id !== referenceId,
      );
      if (nextFragments.length === previous.length) return current;
      const next = new Map(current);
      next.set(normalizedChatKey, { ...draft, fragments: nextFragments });
      return next;
    });
  }, [normalizedChatKey]);

  useEffect(() => {
    if (normalizedChatKey !== "__new_chat__") return;
    setByChat(current => {
      if (!current.has(normalizedChatKey)) return current;
      const next = new Map(current);
      next.delete(normalizedChatKey);
      return next;
    });
  }, [normalizedChatKey]);

  useEffect(() => {
    const handleAccepted = (event: Event) => {
      const rawIds = (event as CustomEvent).detail?.referenceIds;
      const ids = new Set(
        Array.isArray(rawIds)
          ? rawIds.map((value: unknown) => String(value || "").trim()).filter(Boolean)
          : [],
      );
      if (ids.size === 0) return;
      setByChat((current) => {
        let changed = false;
        const next = new Map<string, SelectionDraft>();
        for (const [key, draft] of current) {
          const items = draft.fragments;
          const retained = items.filter((item) => !ids.has(item.reference.id));
          if (retained.length !== items.length) changed = true;
          next.set(key, { ...draft, fragments: retained });
        }
        return changed ? next : current;
      });
    };
    window.addEventListener(SELECTED_TEXT_REFERENCES_ACCEPTED_EVENT, handleAccepted);
    return () => window.removeEventListener(
      SELECTED_TEXT_REFERENCES_ACCEPTED_EVENT,
      handleAccepted,
    );
  }, []);

  const references = useMemo(
    () => fragments.map((fragment) => fragment.reference),
    [fragments],
  );
  const attachments = useMemo(
    () => fragments.map(selectedTextReferenceToAttachment),
    [fragments],
  );

  return {
    fragments,
    references,
    attachments,
    addFragment,
    updateAnnotation,
    removeFragment,
  };
}
