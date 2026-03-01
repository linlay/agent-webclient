import { MAX_DEBUG_LINES } from '../context/constants.js';

export function createStatusDebugRuntime(ctx) {
  const { elements, state } = ctx;
  const statusToneClasses = ['is-idle', 'is-running', 'is-error', 'is-success'];

  function inferStatusTone(text) {
    const normalized = String(text || '').toLowerCase();

    if (/(run\.error|run\.cancel|\berror\b|\bfailed\b|缺失|为空|失败|错误|unmatched)/.test(normalized)) {
      return 'error';
    }

    if (/(streaming|loading|query|refresh|run\.start|pending|等待|处理中|loading)/.test(normalized)) {
      return 'running';
    }

    if (/(ready|loaded|complete|applied|accepted|ended|new chat ready|cleared|已应用|已清空|已加载|完成)/.test(normalized)) {
      return 'success';
    }

    return 'idle';
  }

  function setStatus(text, tone = 'normal') {
    const nextText = String(text || 'idle');
    const nextTone = tone === 'error' ? 'error' : inferStatusTone(nextText);
    elements.apiStatus.textContent = nextText;
    elements.apiStatus.classList.remove(...statusToneClasses);
    elements.apiStatus.classList.add(`is-${nextTone}`);
    elements.apiStatus.setAttribute('data-tone', nextTone);
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
