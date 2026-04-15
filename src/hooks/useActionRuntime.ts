import { useEffect, useRef } from 'react';
import { createActionRuntime, safeJsonParse, type ActionRuntime } from '../lib/actionRuntime';
import { useAppContext } from '../context/AppContext';
import type { AgentEvent } from '../context/types';

interface ActionBufferState {
  actionName: string;
  argsBuffer: string;
}

function resolveActionArgsFromEvent(event: AgentEvent): Record<string, unknown> | null {
  const candidate = event.actionParams;
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    return candidate as Record<string, unknown>;
  }

  return null;
}

export function shouldSkipHistoricalActionBatch(params: {
  eventCursor: number;
  eventsLength: number;
  streaming: boolean;
}): boolean {
  return !params.streaming && params.eventCursor === 0 && params.eventsLength > 0;
}

/**
 * Hook to initialize the ActionRuntime (for things like launch_fireworks, switch_theme, show_modal)
 * and listen to the event stream for `action.start` events to automatically execute them.
 */
export function useActionRuntime() {
  const { state, dispatch } = useAppContext();
  const runtimeRef = useRef<ActionRuntime | null>(null);
  const eventCursorRef = useRef(0);
  const actionBuffersRef = useRef(new Map<string, ActionBufferState>());
  const executedActionIdsRef = useRef(new Set<string>());

  /* 1. Initialize ActionRuntime based on DOM elements */
  useEffect(() => {
    // We defer initialization slightly to ensure all DOM nodes are mounted
    const initTimer = setTimeout(() => {
      const root = document.documentElement;
      const canvas = document.getElementById('fireworks-canvas') as HTMLCanvasElement;
      const modalRoot = document.getElementById('action-modal') || document.createElement('div');
      const modalTitle = document.getElementById('action-modal-title') || document.createElement('div');
      const modalContent = document.getElementById('action-modal-content') || document.createElement('div');
      const modalClose = document.getElementById('action-modal-close') || document.createElement('button');

      if (!canvas) {
        console.warn('ActionRuntime: fireworks-canvas not found in DOM.');
        return;
      }

      const runtime = createActionRuntime({
        root,
        canvas,
        modalRoot,
        modalTitle,
        modalContent,
        modalClose,
        onThemeChange: (theme) => {
          dispatch({ type: 'SET_THEME_MODE', themeMode: theme });
        },
        onStatus: (text) => {
          dispatch({ type: 'APPEND_DEBUG', line: `[ActionRuntime] ${text}` });
        },
      });

      runtimeRef.current = runtime;
    }, 100);

    return () => clearTimeout(initTimer);
  }, [dispatch]);

  /* 2. Listen to the latest events and execute actions */
  useEffect(() => {
    if (!runtimeRef.current) return;

    const events = state.events;
    if (events.length === 0) {
      eventCursorRef.current = 0;
      actionBuffersRef.current.clear();
      executedActionIdsRef.current.clear();
      return;
    }

    if (events.length < eventCursorRef.current) {
      eventCursorRef.current = 0;
      actionBuffersRef.current.clear();
      executedActionIdsRef.current.clear();
    }

    if (shouldSkipHistoricalActionBatch({
      eventCursor: eventCursorRef.current,
      eventsLength: events.length,
      streaming: state.streaming,
    })) {
      dispatch({
        type: 'APPEND_DEBUG',
        line: `[ActionRuntime] Skip ${events.length} historical action events during chat hydration`,
      });
      eventCursorRef.current = events.length;
      actionBuffersRef.current.clear();
      executedActionIdsRef.current.clear();
      return;
    }

    const tryExecute = (actionId: string, actionName: string, args: Record<string, unknown>) => {
      if (!actionId || executedActionIdsRef.current.has(actionId)) {
        return;
      }
      executedActionIdsRef.current.add(actionId);

      if (!state.streaming) {
        dispatch({
          type: 'APPEND_DEBUG',
          line: `[ActionRuntime] Skip historical action ${actionName || 'unknown'} during non-streaming phase, actionId=${actionId}`,
        });
        return;
      }

      try {
        runtimeRef.current?.execute(actionName || 'unknown', args);
      } catch (error) {
        dispatch({
          type: 'APPEND_DEBUG',
          line: `[ActionRuntime] Failed to execute ${actionName}: ${(error as Error).message}`,
        });
      }
    };

    for (let index = eventCursorRef.current; index < events.length; index += 1) {
      const event = events[index];
      const type = String(event?.type || '');
      if (!type.startsWith('action.')) {
        continue;
      }

      const actionId = String(event.actionId || '').trim();
      if (!actionId) {
        continue;
      }

      if (type === 'action.start') {
        const current = actionBuffersRef.current.get(actionId) || {
          actionName: 'unknown',
          argsBuffer: '',
        };
        if (typeof event.actionName === 'string' && event.actionName.trim()) {
          current.actionName = event.actionName;
        }
        actionBuffersRef.current.set(actionId, current);

        const directArgs = resolveActionArgsFromEvent(event);
        if (directArgs) {
          tryExecute(actionId, current.actionName, directArgs);
        }
        continue;
      }

      if (type === 'action.args') {
        const current = actionBuffersRef.current.get(actionId) || {
          actionName: 'unknown',
          argsBuffer: '',
        };
        if (typeof event.actionName === 'string' && event.actionName.trim()) {
          current.actionName = event.actionName;
        }
        current.argsBuffer += String(event.delta || '');
        actionBuffersRef.current.set(actionId, current);
        continue;
      }

      if (type === 'action.snapshot') {
        const current = actionBuffersRef.current.get(actionId) || {
          actionName: typeof event.actionName === 'string' && event.actionName.trim() ? event.actionName : 'unknown',
          argsBuffer: '',
        };
        if (typeof event.actionName === 'string' && event.actionName.trim()) {
          current.actionName = event.actionName;
        }
        actionBuffersRef.current.set(actionId, current);
        const args = resolveActionArgsFromEvent(event) || {};
        tryExecute(actionId, current.actionName, args);
        continue;
      }

      if (type === 'action.end') {
        const current = actionBuffersRef.current.get(actionId);
        if (!current) {
          continue;
        }
        const bufferedArgs = safeJsonParse(current.argsBuffer, {});
        tryExecute(actionId, current.actionName, bufferedArgs);
      }
    }

    eventCursorRef.current = events.length;
  }, [state.events, state.streaming, dispatch]);
}
