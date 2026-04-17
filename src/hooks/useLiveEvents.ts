import { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAgentEventHandler } from './useAgentEventHandler';
import type { AgentEvent } from '../context/types';

/**
 * useLiveEvents — legacy SSE compatibility hook for `/api/live`.
 *
 * Default real-time sync now comes from `/ws` push frames handled by
 * `useWsTransport`. Keep this hook only for manual SSE compatibility mode.
 */
export function useLiveEvents() {
  const { dispatch, state, stateRef } = useAppContext();
  const { handleEvent } = useAgentEventHandler();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state.transportMode !== 'sse') {
      return;
    }

    let disposed = false;

    function connect() {
      if (disposed) return;

      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      try {
        const es = new EventSource('/api/live');
        eventSourceRef.current = es;

        es.addEventListener('message', (e: MessageEvent) => {
          if (disposed) return;

          try {
            const event = JSON.parse(e.data) as AgentEvent;
            const type = String(event.type || '');

            // Skip connection status events
            if (type === 'live.connected') {
              dispatch({
                type: 'APPEND_DEBUG',
                line: `[live] Connected to relay live stream`,
              });
              return;
            }

            // Skip events for a different chat than the one we're viewing
            const currentChatId = String(stateRef.current.chatId || '').trim();
            const eventChatId = String(event.chatId || '').trim();

            // If we're currently streaming (initiated by webclient), skip live events
            // to avoid double-rendering
            if (stateRef.current.streaming) {
              return;
            }

            // If we have an active chat and this event is for a different chat, skip
            if (currentChatId && eventChatId && eventChatId !== currentChatId) {
              return;
            }

            // Process the event through the existing event handler pipeline
            handleEvent(event);
          } catch {
            // Ignore parse errors for live events
          }
        });

        es.onerror = () => {
          if (disposed) return;
          es.close();
          eventSourceRef.current = null;

          // Reconnect after 3 seconds
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
          }
          reconnectTimerRef.current = setTimeout(() => {
            if (!disposed) connect();
          }, 3000);
        };
      } catch {
        // EventSource not supported or connection error
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = setTimeout(() => {
          if (!disposed) connect();
        }, 5000);
      }
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [dispatch, handleEvent, state.transportMode, stateRef]);
}
