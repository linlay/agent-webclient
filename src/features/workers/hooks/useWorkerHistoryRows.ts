import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import type { AppAction } from '@/app/state/actions';
import type { AppState, Chat, WorkerConversationRow } from '@/app/state/types';
import { mergeFetchedChats } from '@/features/chats/lib/chatSummary';
import type { CommandOverlayState } from '@/features/workers/lib/commandOverlay';
import type { CurrentWorkerSummary } from '@/features/workers/lib/currentWorker';
import {
  buildWorkerHistoryRowsFromChats,
  excludeStreamingCurrentChat,
  filterHistoryRowsBySearch,
  mapSearchResultsToHistoryRows,
} from '@/features/workers/lib/workerHistoryRows';
import { getChats, searchGlobal } from '@/shared/data';

type HistoryLoadStatus = 'idle' | 'loading' | 'success' | 'error';

interface UseWorkerHistoryRowsInput {
  modal: CommandOverlayState;
  currentWorker: CurrentWorkerSummary | null;
  state: Pick<AppState, 'chatId' | 'chats' | 'streaming'>;
  dispatch: Dispatch<AppAction>;
}

interface UseWorkerHistoryRowsResult {
  historyRows: WorkerConversationRow[];
  historyLoading: boolean;
  historyError: string;
  removeHistoryRow: (chatId: string) => void;
}

function normalizeChats(data: unknown): Chat[] {
  return Array.isArray(data) ? (data as Chat[]) : [];
}

export function useWorkerHistoryRows({
  modal,
  currentWorker,
  state,
  dispatch,
}: UseWorkerHistoryRowsInput): UseWorkerHistoryRowsResult {
  const [remoteHistoryRows, setRemoteHistoryRows] = useState<
    WorkerConversationRow[]
  >([]);
  const [status, setStatus] = useState<HistoryLoadStatus>('idle');
  const [error, setError] = useState('');
  const requestSeqRef = useRef(0);
  const chatsRef = useRef(state.chats);

  useEffect(() => {
    chatsRef.current = state.chats;
  }, [state.chats]);

  const modalType = modal.type;
  const historySearch = String(modal.historySearch || '').trim();
  const currentWorkerType = currentWorker?.type || '';
  const currentWorkerSourceId = currentWorker?.sourceId || '';
  const currentWorkerKey = currentWorker?.key || '';
  const currentWorkerRow = currentWorker?.row || null;

  useEffect(() => {
    if (!modal.open || modalType !== 'history') {
      requestSeqRef.current += 1;
      setRemoteHistoryRows([]);
      setStatus('idle');
      setError('');
      return;
    }

    if (!currentWorkerType || !currentWorkerSourceId || !currentWorkerRow) {
      requestSeqRef.current += 1;
      setRemoteHistoryRows([]);
      setStatus('idle');
      setError('');
      return;
    }

    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    setRemoteHistoryRows([]);
    setStatus('loading');
    setError('');

    if (historySearch) {
      const timer = window.setTimeout(() => {
        const params =
          currentWorkerType === 'team'
            ? { query: historySearch, teamId: currentWorkerSourceId, limit: 30 }
            : {
                query: historySearch,
                agentKey: currentWorkerSourceId,
                limit: 30,
              };
        void searchGlobal(params)
          .then((response) => {
            if (requestSeqRef.current !== requestSeq) return;
            const results = Array.isArray(response.data?.results)
              ? response.data.results
              : [];
            setRemoteHistoryRows(mapSearchResultsToHistoryRows({ results }));
            setStatus('success');
          })
          .catch((searchError) => {
            if (requestSeqRef.current !== requestSeq) return;
            dispatch({
              type: 'APPEND_DEBUG',
              line: `[search error] ${(searchError as Error).message}`,
            });
            setRemoteHistoryRows([]);
            setStatus('error');
            setError('历史搜索失败，请稍后重试。');
          });
      }, 250);
      return () => {
        window.clearTimeout(timer);
      };
    }

    const options =
      currentWorkerType === 'agent'
        ? { agentKey: currentWorkerSourceId }
        : undefined;

    void getChats(options)
      .then((response) => {
        if (requestSeqRef.current !== requestSeq) return;
        const fetchedChats = normalizeChats(response.data);
        const chats = mergeFetchedChats(chatsRef.current, fetchedChats);
        dispatch({ type: 'SET_CHATS', chats });
        setRemoteHistoryRows(
          buildWorkerHistoryRowsFromChats({
            chats: fetchedChats,
            worker: currentWorkerRow,
          }),
        );
        setStatus('success');
      })
      .catch((loadError) => {
        if (requestSeqRef.current !== requestSeq) return;
        dispatch({
          type: 'APPEND_DEBUG',
          line: `[loadChats error] ${(loadError as Error).message}`,
        });
        setRemoteHistoryRows([]);
        setStatus('error');
        setError('历史对话加载失败，请稍后重试。');
      });

    return undefined;
  }, [
    currentWorkerKey,
    currentWorkerSourceId,
    currentWorkerType,
    dispatch,
    historySearch,
    modal.open,
    modalType,
  ]);

  const historyRows = useMemo(() => {
    const visibleRows = excludeStreamingCurrentChat(remoteHistoryRows, {
      chatId: state.chatId,
      streaming: state.streaming,
    });
    return historySearch
      ? filterHistoryRowsBySearch(visibleRows, historySearch)
      : visibleRows;
  }, [historySearch, remoteHistoryRows, state.chatId, state.streaming]);

  const removeHistoryRow = useCallback((chatId: string) => {
    const normalizedChatId = String(chatId || '').trim();
    if (!normalizedChatId) return;
    setRemoteHistoryRows((rows) =>
      rows.filter((row) => String(row.chatId || '') !== normalizedChatId),
    );
  }, []);

  return {
    historyRows,
    historyLoading: status === 'loading',
    historyError: error,
    removeHistoryRow,
  };
}
