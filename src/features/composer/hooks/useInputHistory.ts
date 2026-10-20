import { useCallback, useRef, useState } from "react";

// 历史记录的内存边界：单条文案长度、单个会话条数、全局跟踪的会话数。
const MAX_TEXT_LENGTH = 4096;
const MAX_HISTORY_PER_CHAT = 50;
const MAX_TRACKED_CHATS = 20;

// 模块级 LRU 存储：按 chatId 隔离，插入顺序即最近使用顺序。
const historyByChat = new Map<string, string[]>();

interface HistoryCursor {
  chatId: string;
  index: number;
  /** 首次上翻时暂存的当前草稿，下翻到底时还原。 */
  draft: string;
}

export interface InputHistoryController {
  record: (chatId: string, text: string) => void;
  navigatePrevious: (chatId: string, draft: string) => string | null;
  navigateNext: (chatId: string) => string | null;
  reset: (chatId: string) => void;
  canGoPrevious: (chatId: string) => boolean;
  canGoNext: (chatId: string) => boolean;
}

function chatKey(chatId: string): string {
  return String(chatId || "").trim();
}

/**
 * @param fallbackByChat 按 chatId 提供的“后备历史”（例如 timeline 中的用户消息），
 *   按时间从旧到新排列。后备历史排在本次会话输入历史之前（更旧），
 *   导航时优先翻阅本次会话输入历史，翻完后再进入后备历史。
 */
export function useInputHistory(
  fallbackByChat?: ReadonlyMap<string, readonly string[]>,
): InputHistoryController {
  const cursorRef = useRef<HistoryCursor | null>(null);
  const fallbackRef = useRef<ReadonlyMap<string, readonly string[]> | undefined>(
    fallbackByChat,
  );
  fallbackRef.current = fallbackByChat;
  const [, forceRender] = useState(0);

  // 合并后备历史与本次会话输入历史：从旧到新，输入历史中与后备重复的项不再重复出现。
  const mergedHistory = useCallback((chatId: string): string[] => {
    const key = chatKey(chatId);
    const entries = historyByChat.get(key) ?? [];
    const fallback = fallbackRef.current?.get(key) ?? [];
    const fallbackSet = new Set(fallback);
    const result: string[] = [...fallback];
    for (const text of entries) {
      if (fallbackSet.has(text)) continue;
      result.push(text);
    }
    return result;
  }, []);

  const record = useCallback((chatId: string, text: string) => {
    const trimmed = text.trim();
    const key = chatKey(chatId);
    if (!trimmed || !key) return;
    const bounded =
      trimmed.length > MAX_TEXT_LENGTH ? trimmed.slice(0, MAX_TEXT_LENGTH) : trimmed;
    let entries = historyByChat.get(key);
    if (!entries) {
      entries = [];
      historyByChat.set(key, entries);
    }
    // 连续重复的文案只保留一条，避免污染历史。
    if (entries[entries.length - 1] === bounded) return;
    entries.push(bounded);
    if (entries.length > MAX_HISTORY_PER_CHAT) {
      entries.splice(0, entries.length - MAX_HISTORY_PER_CHAT);
    }
    // 刷新 LRU 顺序并淘汰最久未使用的会话。
    historyByChat.delete(key);
    historyByChat.set(key, entries);
    while (historyByChat.size > MAX_TRACKED_CHATS) {
      const oldestKey = historyByChat.keys().next().value;
      if (oldestKey === undefined) break;
      historyByChat.delete(oldestKey);
      if (cursorRef.current?.chatId === oldestKey) cursorRef.current = null;
    }
    // 新记录会破坏当前浏览位置。
    if (cursorRef.current?.chatId === key) cursorRef.current = null;
    forceRender((n) => n + 1);
  }, []);

  const navigatePrevious = useCallback(
    (chatId: string, draft: string): string | null => {
      const key = chatKey(chatId);
      const history = mergedHistory(key);
      if (history.length === 0) return null;
      const cursor = cursorRef.current;
      if (cursor && cursor.chatId === key && cursor.index <= 0) return null;
      const next: HistoryCursor =
        cursor && cursor.chatId === key
          ? { ...cursor, index: cursor.index - 1 }
          : { chatId: key, index: history.length - 1, draft };
      cursorRef.current = next;
      forceRender((n) => n + 1);
      return history[next.index] ?? null;
    },
    [mergedHistory],
  );

  const navigateNext = useCallback(
    (chatId: string): string | null => {
      const key = chatKey(chatId);
      const cursor = cursorRef.current;
      if (!cursor || cursor.chatId !== key) return null;
      const history = mergedHistory(key);
      if (history.length === 0) return null;
      const nextIndex = cursor.index + 1;
      if (nextIndex >= history.length) {
        cursorRef.current = null;
        forceRender((n) => n + 1);
        return cursor.draft;
      }
      cursorRef.current = { ...cursor, index: nextIndex };
      forceRender((n) => n + 1);
      return history[nextIndex] ?? null;
    },
    [mergedHistory],
  );

  const reset = useCallback((chatId: string) => {
    if (cursorRef.current?.chatId === chatKey(chatId)) {
      cursorRef.current = null;
      forceRender((n) => n + 1);
    }
  }, []);

  const canGoPrevious = useCallback(
    (chatId: string) => {
      const key = chatKey(chatId);
      const history = mergedHistory(key);
      if (history.length === 0) return false;
      const cursor = cursorRef.current;
      if (cursor && cursor.chatId === key) return cursor.index > 0;
      return true;
    },
    [mergedHistory],
  );

  const canGoNext = useCallback((chatId: string) => {
    const cursor = cursorRef.current;
    return Boolean(cursor && cursor.chatId === chatKey(chatId));
  }, []);

  return {
    record,
    navigatePrevious,
    navigateNext,
    reset,
    canGoPrevious,
    canGoNext,
  };
}

// 仅测试使用：清空模块级历史存储，隔离用例。
export function resetInputHistoryForTests(): void {
  historyByChat.clear();
}
