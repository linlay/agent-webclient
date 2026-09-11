import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addSelectedTextFragment,
  SELECTED_TEXT_REFERENCES_ACCEPTED_EVENT,
  selectedTextReferenceToAttachment,
  type SelectedTextFragment,
} from "@/features/selection/lib/selectedTextReference";

const EMPTY_SELECTED_TEXT_FRAGMENTS: SelectedTextFragment[] = [];

export function useSelectedTextFragments(chatKey: string) {
  const normalizedChatKey = String(chatKey || "").trim() || "__new_chat__";
  const [byChat, setByChat] = useState<Map<string, SelectedTextFragment[]>>(
    () => new Map(),
  );
  const fragments = byChat.get(normalizedChatKey) || EMPTY_SELECTED_TEXT_FRAGMENTS;

  const addFragment = useCallback((fragment: SelectedTextFragment) => {
    setByChat((current) => {
      const previous = current.get(normalizedChatKey) || [];
      const nextFragments = addSelectedTextFragment(previous, fragment);
      if (nextFragments.length === previous.length) return current;
      const next = new Map(current);
      next.set(normalizedChatKey, nextFragments);
      return next;
    });
    return true;
  }, [normalizedChatKey]);

  const removeFragment = useCallback((referenceId: string) => {
    setByChat((current) => {
      const previous = current.get(normalizedChatKey) || [];
      const nextFragments = previous.filter(
        (fragment) => fragment.reference.id !== referenceId,
      );
      if (nextFragments.length === previous.length) return current;
      const next = new Map(current);
      if (nextFragments.length > 0) next.set(normalizedChatKey, nextFragments);
      else next.delete(normalizedChatKey);
      return next;
    });
  }, [normalizedChatKey]);

  const clearFragments = useCallback(() => {
    setByChat((current) => {
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
        const next = new Map<string, SelectedTextFragment[]>();
        for (const [key, items] of current) {
          const retained = items.filter((item) => !ids.has(item.reference.id));
          if (retained.length !== items.length) changed = true;
          if (retained.length > 0) next.set(key, retained);
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
    removeFragment,
    clearFragments,
  };
}
