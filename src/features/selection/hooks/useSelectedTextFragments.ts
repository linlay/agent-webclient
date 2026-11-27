import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addSelectedTextFragment,
  renumberSelectedTextFragments,
  updateSelectedTextAnnotation,
  validAnnotationIndex,
  SELECTED_TEXT_REFERENCES_ACCEPTED_EVENT,
  selectedTextReferenceToAttachment,
  type SelectedTextFragment,
} from "@/features/selection/lib/selectedTextReference";

const EMPTY_SELECTED_TEXT_FRAGMENTS: SelectedTextFragment[] = [];

type SelectionDraft = { fragments: SelectedTextFragment[]; completedRunId?: string };

export function useSelectedTextFragments(chatKey: string, restoredReferences: readonly unknown[] = [], completedRunId = "") {
  const normalizedChatKey = String(chatKey || "").trim() || "__new_chat__";
  const [byChat, setByChat] = useState<Map<string, SelectionDraft>>(
    () => new Map(),
  );
  const fragments = byChat.get(normalizedChatKey)?.fragments || EMPTY_SELECTED_TEXT_FRAGMENTS;
  // 切回 Chat 时，恢复的引用可能是同一批选区的副本。它们已经由本地草稿持有，
  // 不能再占用编号，否则删除草稿后新编号会从副本之后开始。
  const liveSelectionIds = new Set(fragments.map((fragment) => fragment.reference.id));
  const restoredNextIndex = restoredReferences.reduce<number>((next, value) => {
    if (!value || typeof value !== "object") return next;
    const ref = value as { type?: string; id?: string; annotationIndex?: number };
    if (ref.type !== "selection") return next;
    const id = typeof ref.id === "string" ? ref.id.trim() : "";
    if (id && liveSelectionIds.has(id)) return next;
    return Math.max(next, (validAnnotationIndex(ref.annotationIndex) || 0) + 1);
  }, 1);

  useEffect(() => {
    if (!completedRunId) return;
    setByChat(current => {
      const draft = current.get(normalizedChatKey);
      if (!draft || draft.completedRunId === completedRunId) return current;
      // Keep unsent text and comments, but their numbers belong to the next run.
      const fragments = renumberSelectedTextFragments(draft.fragments);
      const next = new Map(current);
      next.set(normalizedChatKey, { fragments, completedRunId });
      return next;
    });
  }, [normalizedChatKey, completedRunId]);

  const addFragment = useCallback((fragment: SelectedTextFragment) => {
    setByChat((current) => {
      const draft = current.get(normalizedChatKey) || { fragments: [], completedRunId };
      const previous = draft.fragments;
      // 编号只由「当前草稿的最大序号」和「真正占着编号的恢复引用」决定，
      // 不缓存下一号，避免切回 Chat 或删除引用后继续沿用过期值。
      const nextFragments = addSelectedTextFragment(previous, fragment, restoredNextIndex);
      if (nextFragments.length === previous.length) return current;
      const next = new Map(current);
      next.set(normalizedChatKey, { ...draft, fragments: nextFragments });
      return next;
    });
    return true;
  }, [normalizedChatKey, restoredNextIndex, completedRunId]);

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
      const retained = previous.filter(
        (fragment) => fragment.reference.id !== referenceId,
      );
      if (retained.length === previous.length) return current;
      // 删除后编号不能留空档：剩余草稿立刻重排成连续序号（没有历史引用时从 1 开始），
      // 已恢复的历史引用仍占着它原来的编号，所以草稿接在它们之后。
      const fragments = renumberSelectedTextFragments(retained, restoredNextIndex);
      const next = new Map(current);
      next.set(normalizedChatKey, { ...draft, fragments });
      return next;
    });
  }, [normalizedChatKey, restoredNextIndex]);

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
