import { MAX_DEBUG_LINES } from '../context/constants.js';

export function createStatusDebugRuntime(ctx) {
  const { elements, state } = ctx;

  function setStatus(text, tone = 'normal') {
    elements.apiStatus.textContent = text;
    elements.apiStatus.style.color = tone === 'error' ? 'var(--danger)' : 'var(--text-main)';
  }

  function appendDebug(value) {
    const line = typeof value === 'string' ? value : JSON.stringify(value);
    state.debugLines.push(line);
    if (state.debugLines.length > MAX_DEBUG_LINES) {
      state.debugLines.shift();
    }
    elements.debugLog.textContent = state.debugLines.join('\n');
    elements.debugLog.scrollTop = elements.debugLog.scrollHeight;
  }

  function updateChatChip() {
    elements.chatIdChip.textContent = state.chatId || '(new chat)';
  }

  return {
    setStatus,
    appendDebug,
    updateChatChip
  };
}
