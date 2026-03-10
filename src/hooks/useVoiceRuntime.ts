import { useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import type { TimelineNode, TtsVoiceBlock } from '../context/types';
import { initVoiceRuntime } from '../lib/voiceRuntime';

function ensureVoiceBlock(base: Partial<TtsVoiceBlock> = {}): TtsVoiceBlock {
  return {
    signature: String(base.signature || ''),
    text: String(base.text || ''),
    closed: Boolean(base.closed),
    expanded: Boolean(base.expanded),
    status: (base.status as TtsVoiceBlock['status']) || 'ready',
    error: String(base.error || ''),
    sampleRate: base.sampleRate,
    channels: base.channels,
  };
}

export function useVoiceRuntime() {
  const { dispatch, stateRef } = useAppContext();

  useEffect(() => {
    const runtime = initVoiceRuntime({
      getState: () => stateRef.current,
      onPatchBlock: (contentId, signature, patch) => {
        const nodeId = stateRef.current.contentNodeById.get(contentId);
        if (!nodeId) return;
        const current = stateRef.current.timelineNodes.get(nodeId);
        if (!current || current.kind !== 'content') return;

        const blocks = { ...(current.ttsVoiceBlocks || {}) };
        const existing = ensureVoiceBlock(blocks[signature] || { signature });
        blocks[signature] = {
          ...existing,
          ...patch,
          signature,
        };

        const nextNode: TimelineNode = {
          ...current,
          ttsVoiceBlocks: blocks,
        };
        dispatch({ type: 'SET_TIMELINE_NODE', id: nodeId, node: nextNode });
      },
      onRemoveInactiveBlocks: (contentId, activeSignatures) => {
        const nodeId = stateRef.current.contentNodeById.get(contentId);
        if (!nodeId) return;
        const current = stateRef.current.timelineNodes.get(nodeId);
        if (!current || current.kind !== 'content') return;

        const blocks = { ...(current.ttsVoiceBlocks || {}) };
        let changed = false;
        for (const signature of Object.keys(blocks)) {
          if (!activeSignatures.has(signature)) {
            delete blocks[signature];
            changed = true;
          }
        }
        if (!changed) return;

        const nextNode: TimelineNode = {
          ...current,
          ttsVoiceBlocks: blocks,
        };
        dispatch({ type: 'SET_TIMELINE_NODE', id: nodeId, node: nextNode });
      },
      onDebug: (line) => {
        dispatch({ type: 'APPEND_DEBUG', line: `[voice] ${line}` });
      },
      onDebugStatus: (status) => {
        dispatch({ type: 'SET_TTS_DEBUG_STATUS', status });
      },
    });

    const stopHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      runtime.stopAllVoiceSessions(
        String(detail.reason || 'manual'),
        { mode: detail.mode === 'stop' ? 'stop' : 'commit' },
      );
    };
    const resetHandler = () => {
      runtime.resetVoiceRuntime();
    };

    window.addEventListener('agent:voice-stop-all', stopHandler);
    window.addEventListener('agent:voice-reset', resetHandler);

    return () => {
      window.removeEventListener('agent:voice-stop-all', stopHandler);
      window.removeEventListener('agent:voice-reset', resetHandler);
      runtime.resetVoiceRuntime();
    };
  }, [dispatch, stateRef]);
}
