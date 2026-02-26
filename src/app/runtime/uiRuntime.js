import {
  DEBUG_TABS,
  DESKTOP_FIXED_BREAKPOINT,
  TABLET_BREAKPOINT,
  MOBILE_BREAKPOINT
} from '../context/constants.js';
import { formatChatTimeLabel, pickChatAgentLabel } from '../../lib/chatListFormatter.js';
import { parseLeadingMentionDraft } from '../../lib/mentionParser.js';

export function createUiRuntime(ctx) {
  const { state, elements } = ctx;

  function inferLayoutMode(width = window.innerWidth) {
    if (width >= DESKTOP_FIXED_BREAKPOINT) {
      return 'desktop-fixed';
    }

    if (width >= TABLET_BREAKPOINT) {
      return 'tablet-mixed';
    }

    return 'mobile-drawer';
  }

  function syncDrawerState() {
    const isDesktopFixed = state.layoutMode === 'desktop-fixed';
    const isTabletMixed = state.layoutMode === 'tablet-mixed';

    if (isDesktopFixed) {
      elements.leftSidebar.classList.add('is-open');
      elements.rightSidebar.classList.add('is-open');
      elements.drawerOverlay.classList.add('hidden');
      return;
    }

    if (isTabletMixed) {
      elements.leftSidebar.classList.add('is-open');
      elements.rightSidebar.classList.toggle('is-open', state.rightDrawerOpen);
      elements.drawerOverlay.classList.toggle('hidden', !state.rightDrawerOpen);
      return;
    }

    const leftOpen = state.leftDrawerOpen;
    const rightOpen = state.rightDrawerOpen;
    elements.leftSidebar.classList.toggle('is-open', leftOpen);
    elements.rightSidebar.classList.toggle('is-open', rightOpen);
    elements.drawerOverlay.classList.toggle('hidden', !(leftOpen || rightOpen));
  }

  function closeDrawers() {
    if (state.layoutMode === 'desktop-fixed') {
      syncDrawerState();
      return;
    }

    if (state.layoutMode === 'tablet-mixed') {
      state.rightDrawerOpen = false;
      syncDrawerState();
      return;
    }

    state.leftDrawerOpen = false;
    state.rightDrawerOpen = false;
    syncDrawerState();
  }

  function updateLayoutMode(width = window.innerWidth) {
    const next = inferLayoutMode(width);
    state.layoutMode = next;

    elements.app.classList.remove('layout-desktop-fixed', 'layout-tablet-mixed', 'layout-mobile-drawer');
    elements.app.classList.add(`layout-${next}`);

    if (next === 'desktop-fixed') {
      state.leftDrawerOpen = false;
      state.rightDrawerOpen = false;
    } else if (next === 'tablet-mixed') {
      state.leftDrawerOpen = false;
    }

    syncDrawerState();
  }

  function setSettingsOpen(open) {
    state.settingsOpen = Boolean(open);
    elements.settingsModal.classList.toggle('hidden', !state.settingsOpen);
  }

  function setAccessTokenError(message = '') {
    const hasError = Boolean(String(message || '').trim());
    elements.accessTokenFieldGroup.classList.toggle('is-error', hasError);
    elements.accessTokenInput.classList.toggle('is-error', hasError);
    elements.accessTokenError.textContent = hasError ? message : '';
    elements.accessTokenError.classList.toggle('hidden', !hasError);
  }

  function clearAccessTokenError() {
    setAccessTokenError('');
  }

  function promptAccessToken(message = '请先输入 Access Token') {
    setSettingsOpen(true);
    setAccessTokenError(message);
    window.requestAnimationFrame(() => {
      elements.accessTokenInput.focus();
      elements.accessTokenInput.select();
    });
  }

  function setDebugTab(tab) {
    if (!DEBUG_TABS.includes(tab)) {
      return;
    }

    state.activeDebugTab = tab;
    if (tab !== 'events') {
      hideEventPopover();
    }
    renderDebugTabs();
  }

  function summarizeEvent(event) {
    const keys = ['chatId', 'runId', 'contentId', 'reasoningId', 'toolId', 'actionId', 'planId', 'taskId'];
    const kv = keys
      .filter((key) => Object.prototype.hasOwnProperty.call(event, key))
      .map((key) => `${key}=${event[key]}`)
      .join(' ');

    if (kv) {
      return kv;
    }

    if (event.type === 'request.query') {
      return event.message || '';
    }

    if (event.type === 'content.delta' || event.type === 'reasoning.delta') {
      return (event.delta || '').slice(0, 120);
    }

    if (event.type === 'content.snapshot' || event.type === 'reasoning.snapshot') {
      return (event.text || '').slice(0, 120);
    }

    if (event.type === 'tool.result' || event.type === 'action.result') {
      return typeof event.result === 'string' ? event.result.slice(0, 120) : JSON.stringify(event.result).slice(0, 120);
    }

    return '';
  }

  function toEventJsonText(event) {
    try {
      return JSON.stringify(event, null, 2);
    } catch (_error) {
      return String(event);
    }
  }

  function hideEventPopover() {
    state.eventPopoverIndex = -1;
    state.eventPopoverEventRef = null;
    elements.eventPopover.classList.add('hidden');
    elements.eventPopoverTitle.textContent = 'Event';
    elements.eventPopoverBody.textContent = '';
  }

  function positionEventPopover(anchorRect) {
    const margin = 8;
    const width = Math.min(460, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(anchorRect.left, window.innerWidth - width - margin));

    elements.eventPopover.style.maxWidth = `${width}px`;
    elements.eventPopover.style.left = `${left}px`;

    const preferredTop = anchorRect.bottom + 8;
    const maxTop = window.innerHeight - elements.eventPopover.offsetHeight - margin;
    const top = Math.max(margin, Math.min(preferredTop, maxTop));
    elements.eventPopover.style.top = `${top}px`;
  }

  function openEventPopover(eventIndex, anchorRect) {
    const event = state.events[eventIndex];
    if (!event) {
      hideEventPopover();
      return;
    }

    const seq = event.seq ?? '-';
    const type = event.type || 'unknown';
    elements.eventPopoverTitle.textContent = `#${seq} ${type}`;
    elements.eventPopoverBody.textContent = toEventJsonText(event);
    elements.eventPopover.classList.remove('hidden');

    state.eventPopoverIndex = eventIndex;
    state.eventPopoverEventRef = event;
    positionEventPopover(anchorRect);
  }

  function toggleEventPopover(eventIndex, anchorRect) {
    if (state.eventPopoverIndex === eventIndex && !elements.eventPopover.classList.contains('hidden')) {
      hideEventPopover();
      return;
    }
    openEventPopover(eventIndex, anchorRect);
  }

  function isEventPopoverTarget(target) {
    return elements.eventPopover.contains(target);
  }

  function renderEvents() {
    const visibleEvents = state.events.slice(-300);
    const startIndex = state.events.length - visibleEvents.length;

    const html = visibleEvents
      .map((event, offset) => {
        const eventIndex = startIndex + offset;
        const seq = event.seq ?? '-';
        const ts = event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '--';
        const summary = summarizeEvent(event);
        const summaryHtml = summary
          ? `<div class="event-row-summary">${ctx.ui.escapeHtml(summary)}</div>`
          : '';

        return `
          <div class="event-row is-clickable" data-event-index="${eventIndex}">
            <div class="event-row-head">
              <strong>#${ctx.ui.escapeHtml(seq)} ${ctx.ui.escapeHtml(event.type || 'unknown')}</strong>
              <span class="event-row-time">${ctx.ui.escapeHtml(ts)}</span>
            </div>
            ${summaryHtml}
          </div>
        `;
      })
      .join('');

    elements.events.innerHTML = html || '<div class="event-row">暂无事件</div>';
    elements.events.scrollTop = elements.events.scrollHeight;

    if (state.eventPopoverEventRef) {
      const nextIndex = state.events.indexOf(state.eventPopoverEventRef);
      if (nextIndex === -1) {
        hideEventPopover();
      } else {
        state.eventPopoverIndex = nextIndex;
      }
    }
  }

  function renderChats() {
    const keyword = state.chatFilter.trim().toLowerCase();
    const filtered = state.chats.filter((chat) => {
      if (!keyword) {
        return true;
      }

      const haystack = `${chat.chatName || ''} ${chat.chatId || ''} ${chat.firstAgentName || ''} ${chat.firstAgentKey || ''}`.toLowerCase();
      return haystack.includes(keyword);
    });

    const html = filtered
      .map((chat) => {
        const agentLabel = pickChatAgentLabel(chat);
        const updated = formatChatTimeLabel(chat.updatedAt);
        const activeClass = chat.chatId === state.chatId ? 'is-active' : '';
        return `
          <button data-chat-id="${ctx.ui.escapeHtml(chat.chatId)}" type="button" class="chat-item ${activeClass}">
            <div class="chat-title">${ctx.ui.escapeHtml(chat.chatName || chat.chatId)}</div>
            <div class="chat-meta-line">${ctx.ui.escapeHtml(agentLabel)} · ${ctx.ui.escapeHtml(updated)}</div>
          </button>
        `;
      })
      .join('');

    if (html) {
      elements.chatsList.innerHTML = html;
      return;
    }

    elements.chatsList.innerHTML = state.chatFilter
      ? '<div class="status-line">无匹配会话</div>'
      : '<div class="status-line">暂无会话</div>';
  }

  function renderAgents() {
    // Agents are consumed by mention suggestions; no dedicated Agent selector UI now.
  }

  function renderDebugTabs() {
    elements.debugTabs.forEach((button) => {
      const tab = button.getAttribute('data-debug-tab');
      button.classList.toggle('active', tab === state.activeDebugTab);
    });

    for (const [tab, panel] of Object.entries(elements.debugPanels)) {
      panel.classList.toggle('hidden', tab !== state.activeDebugTab);
    }
  }

  function renderMentionSuggestions() {
    if (!state.mentionOpen || state.mentionSuggestions.length === 0) {
      elements.mentionSuggest.classList.add('hidden');
      elements.mentionSuggestList.innerHTML = '';
      return;
    }

    elements.mentionSuggest.classList.remove('hidden');

    elements.mentionSuggestList.innerHTML = state.mentionSuggestions
      .map((agent, index) => {
        const active = index === state.mentionActiveIndex ? 'active' : '';
        return `
          <button type="button" class="mention-item ${active}" data-mention-index="${index}">
            <span class="mention-key">@${ctx.ui.escapeHtml(agent.key)}</span>
            <span class="mention-name">${ctx.ui.escapeHtml(agent.name || '')}</span>
          </button>
        `;
      })
      .join('');
  }

  function closeMentionSuggestions() {
    state.mentionOpen = false;
    state.mentionSuggestions = [];
    state.mentionActiveIndex = 0;
    renderMentionSuggestions();
  }

  function updateMentionSuggestions() {
    const draft = parseLeadingMentionDraft(elements.messageInput.value);

    if (!draft) {
      closeMentionSuggestions();
      return;
    }

    const query = (draft.token || '').toLowerCase();
    const candidates = state.agents
      .filter((agent) => {
        const key = String(agent.key || '').toLowerCase();
        const name = String(agent.name || '').toLowerCase();

        if (!query) {
          return true;
        }

        return key.includes(query) || name.includes(query);
      })
      .slice(0, 8);

    if (candidates.length === 0) {
      closeMentionSuggestions();
      return;
    }

    state.mentionOpen = true;
    state.mentionSuggestions = candidates;
    state.mentionActiveIndex = Math.max(0, Math.min(state.mentionActiveIndex, candidates.length - 1));
    renderMentionSuggestions();
  }

  function selectMentionByIndex(index) {
    const agent = state.mentionSuggestions[index];
    if (!agent) {
      return;
    }

    elements.messageInput.value = `@${agent.key} `;
    const caret = elements.messageInput.value.length;
    ctx.ui.autosizeComposerInput();
    elements.messageInput.focus();
    elements.messageInput.setSelectionRange(caret, caret);
    closeMentionSuggestions();
  }

  function normalizeRawAccessToken(input) {
    const value = String(input ?? '').trim();
    if (!value) {
      return { ok: false, error: 'Access Token 不能为空' };
    }
    if (/^bearer\s+/i.test(value)) {
      return { ok: false, error: '请仅输入原始 Access Token，不要包含 Bearer 前缀' };
    }
    return { ok: true, token: value };
  }

  return {
    inferLayoutMode,
    syncDrawerState,
    closeDrawers,
    updateLayoutMode,
    setSettingsOpen,
    setDebugTab,
    renderEvents,
    renderChats,
    renderAgents,
    renderDebugTabs,
    renderMentionSuggestions,
    closeMentionSuggestions,
    updateMentionSuggestions,
    selectMentionByIndex,
    setAccessTokenError,
    clearAccessTokenError,
    promptAccessToken,
    normalizeRawAccessToken,
    hideEventPopover,
    toggleEventPopover,
    isEventPopoverTarget,
    mobileBreakpoint: MOBILE_BREAKPOINT
  };
}
