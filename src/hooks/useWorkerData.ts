import { useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { getAgent, getAgents, getChats, getTeams, setAccessToken } from '../lib/apiClientProxy';
import type { Agent, Chat, Team, WorkerRow } from '../context/types';
import {
  refreshWorkerDataWithCoordinator,
  type WorkerDataSnapshot,
  type WorkerRefreshOverrides,
} from '../lib/workerDataCoordinator';
import { buildWorkerRows } from '../lib/workerListFormatter';
import {
  buildSelectedWorkerConversationRows,
  mergeFetchedChats,
} from '../lib/chatSummary';
import { upsertAgentSummary } from '../lib/agentSummary';

export function useWorkerData(input: {
  loadChat: (chatId: string, options?: { focusComposerOnComplete?: boolean }) => Promise<void>;
  selectWorkerConversation: (workerKey: string, options?: { focusComposerOnComplete?: boolean }) => Promise<void>;
}) {
  const { loadChat, selectWorkerConversation } = input;
  const { state, dispatch, stateRef } = useAppContext();
  const bootstrappedRef = useRef(false);

  const extractAgentWorkerKey = useCallback((detail: { workerKey?: unknown; agentKey?: unknown }): string => {
    const explicitAgentKey = String(detail.agentKey || '').trim();
    if (explicitAgentKey) {
      return `agent:${explicitAgentKey}`;
    }
    const workerKey = String(detail.workerKey || '').trim();
    return workerKey.startsWith('agent:') ? workerKey : '';
  }, []);

  const findDefaultTeamWorkerKey = useCallback((rows: WorkerRow[]): string => {
    const matched = rows.find((row) => {
      if (row.type !== 'team') return false;
      const name = String(row.displayName || '').trim().toLowerCase();
      const sourceId = String(row.sourceId || '').trim().toLowerCase();
      return name === 'default team'
        || name === 'default_team'
        || name === '默认小组'
        || sourceId === 'default_team'
        || sourceId === 'default';
    });
    return matched?.key || '';
  }, []);

  const ensureWorkerSelection = useCallback((rows: WorkerRow[], preferredWorkerKey = ''): string => {
    const preferred = String(preferredWorkerKey || '').trim();
    if (preferred && rows.some((row) => row.key === preferred)) {
      return preferred;
    }
    const current = String(stateRef.current.workerSelectionKey || '').trim();
    if (current && rows.some((row) => row.key === current)) {
      return current;
    }
    const defaultTeamKey = findDefaultTeamWorkerKey(rows);
    if (defaultTeamKey) return defaultTeamKey;
    return rows[0]?.key || '';
  }, [findDefaultTeamWorkerKey, stateRef]);

  const rebuildWorkerRowsFromState = useCallback((overrides: WorkerRefreshOverrides = {}) => {
    const current = stateRef.current;
    const agents = overrides.agents ?? current.agents;
    const teams = overrides.teams ?? current.teams;
    const chats = overrides.chats ?? current.chats;
    const rows = buildWorkerRows({
      agents,
      teams,
      chats,
      workerPriorityKey: overrides.workerPriorityKey ?? current.workerPriorityKey,
    });
    const workerSelectionKey = ensureWorkerSelection(rows, overrides.workerSelectionKey ?? current.workerSelectionKey);
    if (workerSelectionKey) {
      dispatch({ type: 'SET_WORKER_SELECTION_KEY', workerKey: workerSelectionKey });
    }
    dispatch({ type: 'SET_WORKER_ROWS', rows });

    const workerIndexByKey = new Map(rows.map((row) => [row.key, row] as const));
    const workerChats = buildSelectedWorkerConversationRows({
      chats,
      workerSelectionKey,
      workerIndexByKey,
    });
    dispatch({ type: 'SET_WORKER_RELATED_CHATS', chats: workerChats });
  }, [dispatch, ensureWorkerSelection, stateRef]);

  const getWorkerDataSnapshot = useCallback((): WorkerDataSnapshot => ({
    agents: stateRef.current.agents,
    teams: stateRef.current.teams,
    chats: stateRef.current.chats,
    workerSelectionKey: stateRef.current.workerSelectionKey,
    workerPriorityKey: stateRef.current.workerPriorityKey,
  }), [stateRef]);

  const runWithSidebarLoading = useCallback(async <T,>(task: () => Promise<T>): Promise<T> => {
    dispatch({ type: 'START_SIDEBAR_REQUEST' });
    try {
      return await task();
    } finally {
      dispatch({ type: 'FINISH_SIDEBAR_REQUEST' });
    }
  }, [dispatch]);

  const loadAgents = useCallback(async () => {
    await runWithSidebarLoading(async () => {
      try {
        const response = await getAgents();
        const agents = (response.data as Agent[]) || [];
        dispatch({ type: 'SET_AGENTS', agents });
        rebuildWorkerRowsFromState({ agents });
      } catch (error) {
        dispatch({ type: 'APPEND_DEBUG', line: `[loadAgents error] ${(error as Error).message}` });
      }
    });
  }, [dispatch, rebuildWorkerRowsFromState, runWithSidebarLoading]);

  const loadTeams = useCallback(async () => {
    await runWithSidebarLoading(async () => {
      try {
        const response = await getTeams();
        const teams = (response.data as Team[]) || [];
        dispatch({ type: 'SET_TEAMS', teams });
        rebuildWorkerRowsFromState({ teams });
      } catch (error) {
        dispatch({ type: 'APPEND_DEBUG', line: `[loadTeams error] ${(error as Error).message}` });
      }
    });
  }, [dispatch, rebuildWorkerRowsFromState, runWithSidebarLoading]);

  const loadChats = useCallback(async () => {
    await runWithSidebarLoading(async () => {
      try {
        const response = await getChats();
        const chats = mergeFetchedChats(stateRef.current.chats, (response.data as Chat[]) || []);
        dispatch({ type: 'SET_CHATS', chats });
        rebuildWorkerRowsFromState({ chats });
      } catch (error) {
        dispatch({ type: 'APPEND_DEBUG', line: `[loadChats error] ${(error as Error).message}` });
      }
    });
  }, [dispatch, rebuildWorkerRowsFromState, runWithSidebarLoading, stateRef]);

  const refreshWorkerData = useCallback(async () => {
    await runWithSidebarLoading(async () => {
      await refreshWorkerDataWithCoordinator({
        fetchAgents: async () => {
          const response = await getAgents();
          return (response.data as Agent[]) || [];
        },
        fetchTeams: async () => {
          const response = await getTeams();
          return (response.data as Team[]) || [];
        },
        fetchChats: async () => {
          const response = await getChats();
          return (response.data as Chat[]) || [];
        },
        getSnapshot: getWorkerDataSnapshot,
        applyAgents: (agents) => {
          dispatch({ type: 'SET_AGENTS', agents });
        },
        applyTeams: (teams) => {
          dispatch({ type: 'SET_TEAMS', teams });
        },
        applyChats: (chats) => {
          dispatch({ type: 'SET_CHATS', chats });
        },
        rebuildWorkerRows: rebuildWorkerRowsFromState,
        appendDebug: (line) => {
          dispatch({ type: 'APPEND_DEBUG', line });
        },
      });
    });
  }, [dispatch, getWorkerDataSnapshot, rebuildWorkerRowsFromState, runWithSidebarLoading]);

  const ensureAgentLoadedForWorkerSelection = useCallback(async (
    detail: { workerKey?: unknown; agentKey?: unknown },
  ): Promise<string> => {
    const agentWorkerKey = extractAgentWorkerKey(detail);
    if (!agentWorkerKey) {
      return String(detail.workerKey || '').trim();
    }

    const requestedAgentKey = agentWorkerKey.slice('agent:'.length).trim();
    if (!requestedAgentKey) {
      return String(detail.workerKey || '').trim();
    }

    try {
      const response = await getAgent(requestedAgentKey);
      const payload = (response.data || {}) as Partial<Agent>;
      const resolvedAgentKey = String(payload.key || requestedAgentKey).trim() || requestedAgentKey;
      const mergedAgents = upsertAgentSummary(stateRef.current.agents, {
        ...payload,
        key: resolvedAgentKey,
      });

      flushSync(() => {
        dispatch({ type: 'SET_AGENTS', agents: mergedAgents });
        rebuildWorkerRowsFromState({
          agents: mergedAgents,
          workerPriorityKey: `agent:${resolvedAgentKey}`,
          workerSelectionKey: `agent:${resolvedAgentKey}`,
        });
      });

      return `agent:${resolvedAgentKey}`;
    } catch (error) {
      dispatch({
        type: 'APPEND_DEBUG',
        line: `[loadAgent error] ${(error as Error).message}`,
      });
      return agentWorkerKey;
    }
  }, [dispatch, extractAgentWorkerKey, rebuildWorkerRowsFromState, stateRef]);

  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }
    bootstrappedRef.current = true;

    setAccessToken(stateRef.current.accessToken);
    refreshWorkerData().catch(() => undefined);
  }, [refreshWorkerData, stateRef]);

  useEffect(() => {
    const handler = (e: Event) => {
      const chatId = (e as CustomEvent).detail?.chatId;
      const focusComposerOnComplete = Boolean((e as CustomEvent).detail?.focusComposerOnComplete);
      if (chatId) loadChat(chatId, { focusComposerOnComplete }).catch(() => undefined);
    };
    window.addEventListener('agent:load-chat', handler);
    return () => window.removeEventListener('agent:load-chat', handler);
  }, [loadChat]);

  useEffect(() => {
    const handler = () => {
      loadAgents().catch(() => undefined);
    };
    window.addEventListener('agent:refresh-agents', handler);
    return () => window.removeEventListener('agent:refresh-agents', handler);
  }, [loadAgents]);

  useEffect(() => {
    const handler = () => {
      loadTeams().catch(() => undefined);
    };
    window.addEventListener('agent:refresh-teams', handler);
    return () => window.removeEventListener('agent:refresh-teams', handler);
  }, [loadTeams]);

  useEffect(() => {
    const handler = () => {
      loadChats().catch(() => undefined);
    };
    window.addEventListener('agent:refresh-chats', handler);
    return () => window.removeEventListener('agent:refresh-chats', handler);
  }, [loadChats]);

  useEffect(() => {
    const handler = () => {
      refreshWorkerData().catch(() => undefined);
    };
    window.addEventListener('agent:refresh-worker-data', handler);
    return () => window.removeEventListener('agent:refresh-worker-data', handler);
  }, [refreshWorkerData]);

  useEffect(() => {
    rebuildWorkerRowsFromState({
      workerPriorityKey: state.workerPriorityKey,
    });
  }, [rebuildWorkerRowsFromState, state.workerPriorityKey]);

  useEffect(() => {
    rebuildWorkerRowsFromState({
      chats: state.chats,
    });
  }, [rebuildWorkerRowsFromState, state.chats]);

  useEffect(() => {
    const handler = (e: Event) => {
      const mode = (e as CustomEvent).detail?.mode === 'worker' ? 'worker' : 'chat';
      dispatch({ type: 'SET_CONVERSATION_MODE', mode });
      dispatch({ type: 'SET_WORKER_CHAT_PANEL_COLLAPSED', collapsed: true });
      if (mode === 'worker') {
        rebuildWorkerRowsFromState();
      }
    };
    window.addEventListener('agent:set-conversation-mode', handler);
    return () => window.removeEventListener('agent:set-conversation-mode', handler);
  }, [dispatch, rebuildWorkerRowsFromState]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = ((e as CustomEvent).detail || {}) as {
        workerKey?: string;
        agentKey?: string;
        focusComposerOnComplete?: boolean;
      };
      const focusComposerOnComplete = Boolean((e as CustomEvent).detail?.focusComposerOnComplete);
      const requestedWorkerKey = String(detail.workerKey || '').trim();
      const fallbackWorkerKey = extractAgentWorkerKey(detail);
      const nextWorkerKey = requestedWorkerKey || fallbackWorkerKey;
      if (!nextWorkerKey) return;

      ensureAgentLoadedForWorkerSelection(detail)
        .then((resolvedWorkerKey) => (
          selectWorkerConversation(resolvedWorkerKey || nextWorkerKey, { focusComposerOnComplete })
        ))
        .catch(() => undefined);
    };
    window.addEventListener('agent:select-worker', handler);
    return () => window.removeEventListener('agent:select-worker', handler);
  }, [ensureAgentLoadedForWorkerSelection, extractAgentWorkerKey, selectWorkerConversation]);

  return {
    loadAgents,
    loadTeams,
    loadChats,
    refreshWorkerData,
  };
}
