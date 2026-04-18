import { useEffect } from 'react';
import { useAppContext } from '@/app/state/AppContext';
import { getVoiceRuntime, initVoiceRuntime } from '@/features/voice/lib/voiceRuntime';

export function useVoiceRuntime() {
  const { state, dispatch, stateRef } = useAppContext();

  useEffect(() => {
    const runtime = initVoiceRuntime({
      getState: () => stateRef.current,
      onPatchBlock: (contentId, signature, patch) => {
        const nodeId = stateRef.current.contentNodeById.get(contentId);
        if (!nodeId) return;
        dispatch({
          type: 'PATCH_CONTENT_TTS_VOICE_BLOCK',
          nodeId,
          signature,
          patch: {
            ...patch,
            signature,
          },
        });
      },
      onRemoveInactiveBlocks: (contentId, activeSignatures) => {
        const nodeId = stateRef.current.contentNodeById.get(contentId);
        if (!nodeId) return;

        dispatch({
          type: 'REMOVE_INACTIVE_CONTENT_TTS_VOICE_BLOCKS',
          nodeId,
          activeSignatures,
        });
      },
      onDebug: (line) => {
        dispatch({ type: 'APPEND_DEBUG', line: `[voice] ${line}` });
      },
      onDebugStatus: (status) => {
        dispatch({ type: 'SET_TTS_DEBUG_STATUS', status });
      },
      onVoiceChatError: (message) => {
        if (stateRef.current.inputMode !== 'voice') return;
        dispatch({
          type: 'PATCH_VOICE_CHAT',
          patch: {
            status: 'error',
            error: message,
            sessionActive: false,
            activeAssistantContentId: '',
            activeRequestId: '',
            activeTtsTaskId: '',
            ttsCommitted: false,
          },
        });
      },
    });
    runtime.setMuted(stateRef.current.audioMuted);

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

  useEffect(() => {
    getVoiceRuntime()?.setMuted(state.audioMuted);
  }, [state.audioMuted]);
}
