import './styles.css';

import {
  ApiError,
  createQueryStream,
  createRequestId,
  getAgents,
  getChat,
  getChats,
  getViewport,
  submitTool
} from './lib/apiClient.js';
import { createActionRuntime, safeJsonParse } from './lib/actionRuntime.js';
import { parseLeadingAgentMention, parseLeadingMentionDraft } from './lib/mentionParser.js';
import { consumeJsonSseStream } from './lib/sseParser.js';
import { parseViewportBlocks } from './lib/viewportParser.js';

const PLAN_AUTO_COLLAPSE_MS = 4000;
const MAX_EVENTS = 1000;
const MAX_DEBUG_LINES = 220;
const TABLET_BREAKPOINT = 768;
const MOBILE_BREAKPOINT = 1080;
const DESKTOP_FIXED_BREAKPOINT = 1280;
const DEBUG_TABS = ['events', 'logs', 'tools'];

const elements = {
  app: document.getElementById('app'),
  leftSidebar: document.getElementById('left-sidebar'),
  rightSidebar: document.getElementById('right-sidebar'),
  drawerOverlay: document.getElementById('drawer-overlay'),
  openLeftDrawerBtn: document.getElementById('open-left-drawer-btn'),
  openRightDrawerBtn: document.getElementById('open-right-drawer-btn'),
  leftDrawerCloseBtn: document.getElementById('left-drawer-close'),
  rightDrawerCloseBtn: document.getElementById('right-drawer-close'),
  newChatBtn: document.getElementById('new-chat-btn'),
  chatSearchInput: document.getElementById('chat-search-input'),
  settingsToggleBtn: document.getElementById('settings-toggle-btn'),
  agentLockChip: document.getElementById('agent-lock-chip'),
  agentClearBtn: document.getElementById('agent-clear-btn'),
  settingsModal: document.getElementById('settings-modal'),
  settingsCloseBtn: document.getElementById('settings-close-btn'),
  agentSelect: document.getElementById('agent-select'),
  refreshAgentsBtn: document.getElementById('refresh-agents-btn'),
  refreshChatsBtn: document.getElementById('refresh-chats-btn'),
  loadRawBtn: document.getElementById('load-raw-btn'),
  stopStreamBtn: document.getElementById('stop-stream-btn'),
  themeToggleBtn: document.getElementById('theme-toggle-btn'),
  chatIdChip: document.getElementById('chat-id-chip'),
  apiStatus: document.getElementById('api-status'),
  chatsList: document.getElementById('chats-list'),
  messages: document.getElementById('messages'),
  messageInput: document.getElementById('message-input'),
  sendBtn: document.getElementById('send-btn'),
  mentionSuggest: document.getElementById('mention-suggest'),
  mentionSuggestList: document.getElementById('mention-suggest-list'),
  planPanel: document.getElementById('plan-panel'),
  planToggleBtn: document.getElementById('plan-toggle-btn'),
  planSummaryStatus: document.getElementById('plan-summary-status'),
  planSummaryText: document.getElementById('plan-summary-text'),
  planIdLabel: document.getElementById('plan-id-label'),
  planList: document.getElementById('plan-list'),
  events: document.getElementById('events'),
  debugLog: document.getElementById('debug-log'),
  pendingTools: document.getElementById('pending-tools'),
  debugTabs: Array.from(document.querySelectorAll('.debug-tab')),
  debugPanels: {
    events: document.getElementById('debug-panel-events'),
    logs: document.getElementById('debug-panel-logs'),
    tools: document.getElementById('debug-panel-tools')
  },
  viewportToggleBtn: document.getElementById('viewport-toggle-btn'),
  viewportCollapse: document.getElementById('viewport-collapse'),
  viewportList: document.getElementById('viewport-list'),
  modalRoot: document.getElementById('action-modal'),
  modalTitle: document.getElementById('action-modal-title'),
  modalContent: document.getElementById('action-modal-content'),
  modalClose: document.getElementById('action-modal-close'),
  fireworksCanvas: document.getElementById('fireworks-canvas')
};

const state = {
  agents: [],
  chats: [],
  agentKey: '',
  selectedAgentLocked: '',
  chatId: '',
  runId: '',
  requestId: '',
  streaming: false,
  abortController: null,
  messagesById: new Map(),
  messageOrder: [],
  events: [],
  debugLines: [],
  plan: null,
  toolStates: new Map(),
  toolNodeById: new Map(),
  pendingTools: new Map(),
  reasoningNodeById: new Map(),
  actionStates: new Map(),
  executedActionIds: new Set(),
  renderedViewportSignatures: new Set(),
  viewportNodesBySignature: new Map(),
  timelineNodes: new Map(),
  timelineOrder: [],
  timelineNodeByMessageId: new Map(),
  timelineDomCache: new Map(),
  timelineCounter: 0,
  renderQueue: {
    dirtyNodeIds: new Set(),
    scheduled: false,
    stickToBottomRequested: false,
    fullSyncNeeded: true
  },
  activeReasoningKey: '',
  chatFilter: '',
  settingsOpen: false,
  activeDebugTab: 'events',
  leftDrawerOpen: false,
  rightDrawerOpen: false,
  layoutMode: 'mobile-drawer',
  planExpanded: false,
  planManualOverride: null,
  planAutoCollapseTimer: null,
  viewportExpanded: false,
  mentionOpen: false,
  mentionSuggestions: [],
  mentionActiveIndex: 0
};

const actionRuntime = createActionRuntime({
  root: document.documentElement,
  canvas: elements.fireworksCanvas,
  modalRoot: elements.modalRoot,
  modalTitle: elements.modalTitle,
  modalContent: elements.modalContent,
  modalClose: elements.modalClose,
  onStatus: (text) => setStatus(text)
});

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

function escapeHtml(input) {
  return String(input ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stripViewportBlocksFromText(text) {
  const raw = String(text ?? '');
  if (!raw.includes('```viewport')) {
    return raw.trim();
  }

  return raw
    .replace(/```viewport[\s\S]*?```/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function inferLayoutMode(width = window.innerWidth) {
  if (width >= DESKTOP_FIXED_BREAKPOINT) {
    return 'desktop-fixed';
  }

  if (width >= TABLET_BREAKPOINT) {
    return 'tablet-mixed';
  }

  return 'mobile-drawer';
}

function renderAgentLock() {
  if (!state.selectedAgentLocked) {
    elements.agentLockChip.classList.add('hidden');
    elements.agentClearBtn.classList.add('hidden');
    elements.agentLockChip.textContent = '';
    return;
  }

  elements.agentLockChip.classList.remove('hidden');
  elements.agentClearBtn.classList.remove('hidden');
  elements.agentLockChip.textContent = `@${state.selectedAgentLocked}`;
}

function clearPlanAutoCollapseTimer() {
  if (!state.planAutoCollapseTimer) {
    return;
  }

  window.clearTimeout(state.planAutoCollapseTimer);
  state.planAutoCollapseTimer = null;
}

function schedulePlanAutoCollapse() {
  clearPlanAutoCollapseTimer();

  state.planAutoCollapseTimer = window.setTimeout(() => {
    if (state.planManualOverride !== null) {
      return;
    }

    state.planExpanded = false;
    renderPlan();
  }, PLAN_AUTO_COLLAPSE_MS);
}

function setPlanExpanded(expanded, options = {}) {
  const { manual = false } = options;

  state.planExpanded = Boolean(expanded);

  if (manual) {
    state.planManualOverride = state.planExpanded;
    clearPlanAutoCollapseTimer();
  }

  renderPlan();
}

function closeMentionSuggestions() {
  state.mentionOpen = false;
  state.mentionSuggestions = [];
  state.mentionActiveIndex = 0;
  renderMentionSuggestions();
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

function setDebugTab(tab) {
  if (!DEBUG_TABS.includes(tab)) {
    return;
  }

  state.activeDebugTab = tab;
  renderDebugTabs();
}

function setViewportExpanded(expanded) {
  state.viewportExpanded = Boolean(expanded);
  elements.viewportToggleBtn.setAttribute('aria-expanded', String(state.viewportExpanded));
  elements.viewportCollapse.classList.toggle('hidden', !state.viewportExpanded);
}

function getMessage(id) {
  return state.messagesById.get(id);
}

function nextTimelineNodeId(prefix = 'node') {
  state.timelineCounter += 1;
  return `${prefix}:${state.timelineCounter}`;
}

function ensureTimelineNode(nodeId, initialValue) {
  const existing = state.timelineNodes.get(nodeId);
  if (existing) {
    return existing;
  }

  const created = {
    id: nodeId,
    expanded: false,
    ts: Date.now(),
    ...initialValue
  };

  state.timelineNodes.set(nodeId, created);
  state.timelineOrder.push(nodeId);
  return created;
}

function toPrettyJson(value, fallback = '{}') {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return fallback;
    }

    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch (_error) {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value);
  }
}

function toToolResultPayload(rawResult) {
  if (rawResult === undefined) {
    return null;
  }

  if (typeof rawResult === 'string') {
    const trimmed = rawResult.trim();
    if (!trimmed) {
      return {
        text: '(empty)',
        isCode: false
      };
    }

    try {
      return {
        text: JSON.stringify(JSON.parse(trimmed), null, 2),
        isCode: true
      };
    } catch (_error) {
      return {
        text: rawResult,
        isCode: false
      };
    }
  }

  if (typeof rawResult === 'object') {
    try {
      return {
        text: JSON.stringify(rawResult, null, 2),
        isCode: true
      };
    } catch (_error) {
      return {
        text: String(rawResult),
        isCode: false
      };
    }
  }

  return {
    text: String(rawResult),
    isCode: false
  };
}

function formatTimelineTimestamp(ts) {
  return new Date(ts ?? Date.now()).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function upsertTimelineMessageNode(messageId, role, text, ts) {
  const nodeId = state.timelineNodeByMessageId.get(messageId) || `msg:${messageId}`;
  state.timelineNodeByMessageId.set(messageId, nodeId);

  const node = ensureTimelineNode(nodeId, {
    kind: 'message',
    role,
    text: text ?? '',
    ts: ts ?? Date.now()
  });

  node.kind = 'message';
  node.role = role;
  node.text = text ?? node.text ?? '';
  node.ts = ts ?? node.ts;
}

function ensureReasoningNode(reasoningKey, ts) {
  let nodeId = state.reasoningNodeById.get(reasoningKey);
  if (!nodeId) {
    nodeId = `thinking:${reasoningKey}:${nextTimelineNodeId('thinking')}`;
    state.reasoningNodeById.set(reasoningKey, nodeId);
  }

  return ensureTimelineNode(nodeId, {
    kind: 'thinking',
    text: '',
    status: 'running',
    expanded: false,
    ts: ts ?? Date.now()
  });
}

function ensureToolTimelineNode(toolId, fallback = {}) {
  let nodeId = state.toolNodeById.get(toolId);
  if (!nodeId) {
    nodeId = `tool:${toolId}:${nextTimelineNodeId('tool')}`;
    state.toolNodeById.set(toolId, nodeId);
  }

  const node = ensureTimelineNode(nodeId, {
    kind: 'tool',
    toolId,
    toolName: fallback.toolName || toolId,
    toolApi: fallback.toolApi || '',
    description: fallback.description || '',
    argsText: fallback.argsText || '{}',
    status: 'running',
    result: null,
    expanded: false,
    ts: fallback.ts ?? Date.now()
  });

  node.kind = 'tool';
  node.toolId = toolId;

  if (fallback.toolName) {
    node.toolName = fallback.toolName;
  }

  if (fallback.toolApi !== undefined) {
    node.toolApi = fallback.toolApi;
  }

  if (fallback.description !== undefined) {
    node.description = fallback.description;
  }

  if (fallback.argsText) {
    node.argsText = fallback.argsText;
  }

  if (fallback.status) {
    node.status = fallback.status;
  }

  if (Object.prototype.hasOwnProperty.call(fallback, 'result')) {
    node.result = fallback.result;
  }

  node.ts = fallback.ts ?? node.ts;
  return node;
}

function ensureViewportTimelineNode(signature, block, ts) {
  let nodeId = state.viewportNodesBySignature.get(signature);
  if (!nodeId) {
    nodeId = `viewport:${nextTimelineNodeId('viewport')}`;
    state.viewportNodesBySignature.set(signature, nodeId);
  }

  const node = ensureTimelineNode(nodeId, {
    kind: 'viewport',
    signature,
    key: block.key || '',
    payload: block.payload ?? safeJsonParse(block.payloadRaw, {}),
    payloadRaw: block.payloadRaw || '{}',
    loading: true,
    html: '',
    error: '',
    loadStarted: false,
    lastLoadRunId: '',
    ts: ts ?? Date.now()
  });

  node.kind = 'viewport';
  node.key = block.key || node.key;
  node.payload = block.payload ?? node.payload;
  node.payloadRaw = block.payloadRaw || node.payloadRaw || '{}';
  node.ts = ts ?? node.ts;
  return node;
}

function ensureTimelineRoot() {
  let stack = elements.messages.querySelector('.timeline-stack');
  let lane = stack?.querySelector('.timeline-lane') || null;

  if (!stack || !lane) {
    elements.messages.innerHTML = '<div class="timeline-stack"><div class="timeline-lane"></div></div>';
    stack = elements.messages.querySelector('.timeline-stack');
    lane = stack.querySelector('.timeline-lane');
  }

  return lane;
}

function isTimelineNearBottom() {
  const gap = elements.messages.scrollHeight - elements.messages.scrollTop - elements.messages.clientHeight;
  return gap <= 56;
}

function renderToolResultMarkup(result, status) {
  if (!result) {
    return '';
  }

  const bodyClass = result.isCode ? 'tool-result-body is-code' : 'tool-result-body';
  return `
    <section class="tool-result-card">
      <div class="tool-result-head">
        <strong>Tool Result</strong>
        <span class="tool-result-state">${escapeHtml(status || 'completed')}</span>
      </div>
      <div class="${bodyClass}">${escapeHtml(result.text || '')}</div>
    </section>
  `;
}

function patchTimelineNode(nodeId) {
  const node = state.timelineNodes.get(nodeId);
  const row = state.timelineDomCache.get(nodeId);

  if (!node || !row) {
    return;
  }

  row.classList.remove('hidden');
  const timestamp = formatTimelineTimestamp(node.ts);

  if (node.kind === 'message' && node.role === 'user') {
    row.className = 'timeline-row timeline-row-user';
    row.innerHTML = `
      <div class="timeline-user-bubble">
        <div class="timeline-text">${escapeHtml(node.text || '')}</div>
        <div class="timeline-time">${escapeHtml(timestamp)}</div>
      </div>
    `;
    return;
  }

  if (node.kind === 'message' && node.role === 'assistant') {
    const visibleText = stripViewportBlocksFromText(node.text || '');
    if (!visibleText) {
      row.className = 'timeline-row hidden';
      row.innerHTML = '';
      return;
    }

    row.className = 'timeline-row timeline-row-flow';
    row.innerHTML = `
      <div class="timeline-marker"><span class="node-icon node-icon-assistant" aria-hidden="true"></span></div>
      <div class="timeline-flow-content">
        <div class="timeline-text">${escapeHtml(visibleText)}</div>
        <div class="timeline-time">${escapeHtml(timestamp)}</div>
      </div>
    `;
    return;
  }

  if (node.kind === 'message' && node.role === 'system') {
    row.className = 'timeline-row timeline-row-flow';
    row.innerHTML = `
      <div class="timeline-marker"><span class="node-icon node-icon-alert" aria-hidden="true"></span></div>
      <div class="timeline-flow-content">
        <div class="system-alert">${escapeHtml(node.text || '')}</div>
      </div>
    `;
    return;
  }

  if (node.kind === 'thinking') {
    const expanded = Boolean(node.expanded);
    const triggerClass = expanded ? 'thinking-trigger is-open' : 'thinking-trigger';
    const detailClass = expanded ? 'thinking-detail is-open' : 'thinking-detail';
    const title = expanded ? 'Thinking Details' : 'Thinking process...';
    const content = node.text && node.text.trim() ? escapeHtml(node.text) : 'Waiting for reasoning...';

    row.className = 'timeline-row timeline-row-flow';
    row.innerHTML = `
      <div class="timeline-marker"><span class="node-icon node-icon-thinking" aria-hidden="true"></span></div>
      <div class="timeline-flow-content">
        <button type="button" class="${triggerClass}" data-action="toggle-thinking" data-node-id="${escapeHtml(node.id)}">
          <span>${escapeHtml(title)}</span>
          <span class="chevron">›</span>
        </button>
        <div class="${detailClass}">${content}</div>
        <div class="timeline-time">${escapeHtml(timestamp)}</div>
      </div>
    `;
    return;
  }

  if (node.kind === 'tool') {
    const expanded = Boolean(node.expanded);
    const detailClass = expanded ? 'tool-detail is-open' : 'tool-detail';
    const argsText = node.argsText && node.argsText.trim() ? node.argsText : '{}';
    const resultMarkup = renderToolResultMarkup(node.result, node.status);

    row.className = 'timeline-row timeline-row-flow';
    row.innerHTML = `
      <div class="timeline-marker"><span class="node-icon node-icon-tool" aria-hidden="true"></span></div>
      <div class="timeline-flow-content">
        <button type="button" class="tool-pill" data-action="toggle-tool" data-node-id="${escapeHtml(node.id)}">
          <span class="bolt">⚡</span>
          <span>call: ${escapeHtml(node.toolName || node.toolId || 'tool')}</span>
        </button>
        <section class="${detailClass}">
          <div class="tool-head">INPUT PARAMETERS</div>
          <pre class="tool-code">${escapeHtml(argsText)}</pre>
          ${resultMarkup}
        </section>
        <div class="timeline-time">${escapeHtml(timestamp)}</div>
      </div>
    `;
    return;
  }

  if (node.kind === 'viewport') {
    row.className = 'timeline-row timeline-row-flow';
    row.innerHTML = `
      <div class="timeline-marker"><span class="node-icon node-icon-viewport" aria-hidden="true"></span></div>
      <div class="timeline-flow-content">
        <div class="timeline-viewport-card">
          <div class="timeline-viewport-head">viewport: ${escapeHtml(node.key || '-')}</div>
          <div class="timeline-viewport-body"></div>
        </div>
        <div class="timeline-time">${escapeHtml(timestamp)}</div>
      </div>
    `;

    const viewportBody = row.querySelector('.timeline-viewport-body');
    if (!viewportBody) {
      return;
    }

    if (node.error) {
      viewportBody.innerHTML = `<div class="status-line">${escapeHtml(node.error)}</div>`;
      return;
    }

    if (node.loading || !node.html) {
      viewportBody.innerHTML = '<div class="status-line">loading viewport...</div>';
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.className = 'timeline-viewport-frame';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.srcdoc = node.html;
    iframe.addEventListener('load', () => {
      try {
        const payload = node.payload ?? safeJsonParse(node.payloadRaw, {});
        iframe.contentWindow?.postMessage(payload, '*');
      } catch (error) {
        appendDebug(`viewport postMessage failed: ${error.message}`);
      }
    });
    viewportBody.replaceChildren(iframe);
  }
}

function syncTimelineOrder(lane, orderedNodes) {
  const activeIds = new Set(orderedNodes.map((node) => node.id));
  for (const [nodeId, rowEl] of state.timelineDomCache.entries()) {
    if (!activeIds.has(nodeId)) {
      rowEl.remove();
      state.timelineDomCache.delete(nodeId);
    }
  }

  const created = [];
  const desiredRows = [];
  for (const node of orderedNodes) {
    let rowEl = state.timelineDomCache.get(node.id);
    if (!rowEl) {
      rowEl = document.createElement('article');
      rowEl.setAttribute('data-node-id', node.id);
      state.timelineDomCache.set(node.id, rowEl);
      created.push(node.id);
    }
    desiredRows.push(rowEl);
  }

  let cursor = lane.firstElementChild;
  for (const rowEl of desiredRows) {
    if (rowEl === cursor) {
      cursor = cursor.nextElementSibling;
      continue;
    }
    lane.insertBefore(rowEl, cursor);
  }

  return created;
}

function flushRenderQueue() {
  state.renderQueue.scheduled = false;
  const orderedNodes = state.timelineOrder
    .map((id) => state.timelineNodes.get(id))
    .filter(Boolean);

  if (orderedNodes.length === 0) {
    elements.messages.innerHTML = '<div class="timeline-empty">暂无消息，发送一条消息开始对话。</div>';
    state.timelineDomCache.clear();
    state.renderQueue.dirtyNodeIds.clear();
    state.renderQueue.stickToBottomRequested = false;
    state.renderQueue.fullSyncNeeded = false;
    return;
  }

  const nearBottomBefore = isTimelineNearBottom();
  const lane = ensureTimelineRoot();
  const createdIds = syncTimelineOrder(lane, orderedNodes);

  const targetIds = state.renderQueue.fullSyncNeeded
    ? orderedNodes.map((node) => node.id)
    : [...state.renderQueue.dirtyNodeIds];
  for (const id of createdIds) {
    targetIds.push(id);
  }

  const uniqueIds = new Set(targetIds);
  for (const nodeId of uniqueIds) {
    patchTimelineNode(nodeId);
  }

  if (state.renderQueue.stickToBottomRequested && nearBottomBefore) {
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }

  state.renderQueue.dirtyNodeIds.clear();
  state.renderQueue.stickToBottomRequested = false;
  state.renderQueue.fullSyncNeeded = false;
}

function scheduleRender({ nodeId, stickToBottom = true, full = false } = {}) {
  if (full || !nodeId) {
    state.renderQueue.fullSyncNeeded = true;
  }

  if (nodeId) {
    state.renderQueue.dirtyNodeIds.add(nodeId);
  }

  if (stickToBottom) {
    state.renderQueue.stickToBottomRequested = true;
  }

  if (!state.renderQueue.scheduled) {
    state.renderQueue.scheduled = true;
    window.requestAnimationFrame(flushRenderQueue);
  }
}

function upsertMessage(id, role, text, ts) {
  const existing = state.messagesById.get(id);
  if (!existing) {
    const created = {
      id,
      role,
      text: text ?? '',
      ts: ts ?? Date.now()
    };
    state.messagesById.set(id, created);
    state.messageOrder.push(id);
    upsertTimelineMessageNode(id, role, created.text, created.ts);
    return created;
  }

  existing.role = role;
  existing.text = text ?? existing.text;
  existing.ts = ts ?? existing.ts;
  upsertTimelineMessageNode(id, role, existing.text, existing.ts);
  return existing;
}

function appendMessageText(id, role, delta, ts) {
  const existing = getMessage(id);
  if (!existing) {
    upsertMessage(id, role, delta, ts);
    return;
  }

  existing.role = role;
  existing.text += delta;
  existing.ts = ts ?? existing.ts;
  upsertTimelineMessageNode(id, role, existing.text, existing.ts);
}

function resetConversationState() {
  state.messagesById.clear();
  state.messageOrder = [];
  state.events = [];
  state.plan = null;
  state.planExpanded = false;
  state.planManualOverride = null;
  clearPlanAutoCollapseTimer();
  state.toolStates.clear();
  state.toolNodeById.clear();
  state.reasoningNodeById.clear();
  state.pendingTools.clear();
  state.actionStates.clear();
  state.executedActionIds.clear();
  state.renderedViewportSignatures.clear();
  state.viewportNodesBySignature.clear();
  state.timelineNodes.clear();
  state.timelineOrder = [];
  state.timelineNodeByMessageId.clear();
  state.timelineDomCache.clear();
  state.timelineCounter = 0;
  state.renderQueue.dirtyNodeIds.clear();
  state.renderQueue.scheduled = false;
  state.renderQueue.stickToBottomRequested = false;
  state.renderQueue.fullSyncNeeded = true;
  state.activeReasoningKey = '';
  elements.viewportList.innerHTML = '';
  renderMessages({ full: true, stickToBottom: false });
  renderEvents();
  renderPlan();
  renderPendingTools();
}

function resetRunTransientState() {
  state.toolStates.clear();
  state.toolNodeById.clear();
  state.reasoningNodeById.clear();
  state.activeReasoningKey = '';
  state.pendingTools.clear();
  state.actionStates.clear();
  state.executedActionIds.clear();
  state.viewportNodesBySignature.clear();
  renderPendingTools();
}

function renderMessages(options = {}) {
  const { stickToBottom = true, full = false, nodeId = '' } = options;
  scheduleRender({ nodeId, stickToBottom, full });
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

function renderEvents() {
  const html = state.events
    .slice(-300)
    .map((event) => {
      const seq = event.seq ?? '-';
      const ts = event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '--';
      const summary = summarizeEvent(event);
      return `<div class="event-row"><strong>#${escapeHtml(seq)}</strong> ${escapeHtml(event.type || 'unknown')} <span>${escapeHtml(ts)}</span><span>${escapeHtml(summary)}</span></div>`;
    })
    .join('');

  elements.events.innerHTML = html || '<div class="event-row">暂无事件</div>';
  elements.events.scrollTop = elements.events.scrollHeight;
}

function normalizePlanStatus(status) {
  const value = String(status || 'pending').toLowerCase();

  if (['completed', 'done', 'success', 'ok'].includes(value)) {
    return 'completed';
  }

  if (['running', 'in_progress', 'working', 'doing', 'init'].includes(value)) {
    return 'running';
  }

  if (['failed', 'error', 'canceled', 'cancelled'].includes(value)) {
    return 'failed';
  }

  return 'pending';
}

function summarizePlan(planItems) {
  const normalized = planItems.map((item) => ({
    ...item,
    normalizedStatus: normalizePlanStatus(item.status)
  }));

  const completed = normalized.filter((item) => item.normalizedStatus === 'completed').length;
  const running = normalized.find((item) => item.normalizedStatus === 'running');
  const pending = normalized.find((item) => item.normalizedStatus === 'pending');
  const failed = normalized.find((item) => item.normalizedStatus === 'failed');
  const focus = running || failed || pending || normalized[normalized.length - 1] || null;

  return {
    normalized,
    completed,
    total: normalized.length,
    summaryText: focus?.description || focus?.taskId || 'Plan updated'
  };
}

function renderPlan() {
  if (!state.plan || !Array.isArray(state.plan.plan) || state.plan.plan.length === 0) {
    elements.planPanel.classList.add('hidden');
    elements.planPanel.classList.remove('is-expanded');
    elements.planToggleBtn.setAttribute('aria-expanded', 'false');
    elements.planIdLabel.textContent = '';
    elements.planList.innerHTML = '';
    elements.planSummaryStatus.textContent = '0/0';
    elements.planSummaryText.textContent = 'No active plan';
    clearPlanAutoCollapseTimer();
    return;
  }

  const planSummary = summarizePlan(state.plan.plan);

  elements.planPanel.classList.remove('hidden');
  elements.planPanel.classList.toggle('is-expanded', state.planExpanded);
  elements.planToggleBtn.setAttribute('aria-expanded', String(state.planExpanded));
  elements.planIdLabel.textContent = state.plan.planId ? `#${state.plan.planId}` : '#-';
  elements.planSummaryStatus.textContent = `${planSummary.completed}/${planSummary.total}`;
  elements.planSummaryText.textContent = planSummary.summaryText;

  elements.planList.innerHTML = planSummary.normalized
    .map((item) => {
      const status = item.normalizedStatus;
      const task = item.taskId || '-';
      const description = item.description || '';
      return `<li class="plan-item" data-status="${escapeHtml(status)}"><span class="plan-badge" aria-hidden="true"></span><span>[${escapeHtml(status)}] ${escapeHtml(task)} · ${escapeHtml(description)}</span></li>`;
    })
    .join('');
}

function renderChats() {
  const keyword = state.chatFilter.trim().toLowerCase();
  const filtered = state.chats.filter((chat) => {
    if (!keyword) {
      return true;
    }

    const haystack = `${chat.chatName || ''} ${chat.chatId || ''} ${chat.firstAgentKey || ''}`.toLowerCase();
    return haystack.includes(keyword);
  });

  const html = filtered
    .map((chat) => {
      const updated = chat.updatedAt ? new Date(chat.updatedAt).toLocaleString() : '--';
      const activeClass = chat.chatId === state.chatId ? 'is-active' : '';
      return `
        <button data-chat-id="${escapeHtml(chat.chatId)}" type="button" class="chat-item ${activeClass}">
          <div class="chat-title">${escapeHtml(chat.chatName || chat.chatId)}</div>
          <div class="chat-meta-line">${escapeHtml(chat.firstAgentKey || 'n/a')} · ${escapeHtml(updated)}</div>
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
  const options = [
    '<option value="">(不固定)</option>',
    ...state.agents.map(
      (item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.key)} · ${escapeHtml(item.name || '')}</option>`
    )
  ].join('');

  elements.agentSelect.innerHTML = options;

  const hasLocked = state.selectedAgentLocked
    && state.agents.some((item) => String(item.key) === String(state.selectedAgentLocked));

  if (!hasLocked) {
    state.selectedAgentLocked = '';
  }

  elements.agentSelect.value = state.selectedAgentLocked || '';
  renderAgentLock();
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

function renderPendingTools() {
  if (state.pendingTools.size === 0) {
    elements.pendingTools.innerHTML = '<div class="status-line">暂无 pending frontend tool</div>';
    return;
  }

  const html = [...state.pendingTools.values()]
    .map((tool) => {
      return `
        <article class="pending-card">
          <div><strong>${escapeHtml(tool.toolName || tool.toolId)}</strong></div>
          <div class="mono">runId=${escapeHtml(tool.runId)}<br/>toolId=${escapeHtml(tool.toolId)}</div>
          <div>toolApi: ${escapeHtml(tool.toolApi || '-')}</div>
          <div>${escapeHtml(tool.description || '')}</div>
          <textarea data-role="pending-payload" data-key="${escapeHtml(tool.key)}">${escapeHtml(tool.payloadText)}</textarea>
          <button data-action="submit-pending" data-key="${escapeHtml(tool.key)}" type="button">Submit /api/submit</button>
          <div class="pending-status ${tool.status === 'error' ? 'err' : tool.status === 'ok' ? 'ok' : ''}">${escapeHtml(tool.statusText || 'pending')}</div>
        </article>
      `;
    })
    .join('');

  elements.pendingTools.innerHTML = html;
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
          <span class="mention-key">@${escapeHtml(agent.key)}</span>
          <span class="mention-name">${escapeHtml(agent.name || '')}</span>
        </button>
      `;
    })
    .join('');
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
  elements.messageInput.focus();
  elements.messageInput.setSelectionRange(caret, caret);
  closeMentionSuggestions();
}

async function renderViewportBlock(block, runId) {
  const signature = `${block.key}::${block.payloadRaw}`;
  if (state.renderedViewportSignatures.has(signature)) {
    return;
  }
  state.renderedViewportSignatures.add(signature);

  const card = document.createElement('article');
  card.className = 'viewport-card';

  const head = document.createElement('div');
  head.className = 'viewport-head';
  head.textContent = `key=${block.key}`;

  const body = document.createElement('div');
  body.className = 'status-line';
  body.textContent = 'loading viewport...';

  card.append(head, body);
  elements.viewportList.prepend(card);

  try {
    const response = await getViewport(block.key, state.chatId || undefined, runId || undefined);
    const html = response.data?.html;

    if (typeof html !== 'string' || !html.trim()) {
      throw new Error('Viewport response does not contain html');
    }

    const iframe = document.createElement('iframe');
    iframe.className = 'viewport-frame';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.srcdoc = html;

    body.replaceWith(iframe);

    iframe.addEventListener('load', () => {
      try {
        iframe.contentWindow?.postMessage(block.payload ?? safeJsonParse(block.payloadRaw, {}), '*');
      } catch (error) {
        appendDebug(`viewport postMessage failed: ${error.message}`);
      }
    });
  } catch (error) {
    body.textContent = `viewport failed: ${error.message}`;
    body.style.color = 'var(--danger)';
  }
}

function viewportSignature(contentId, block) {
  return `${contentId || 'content'}::${block.key}::${block.payloadRaw}`;
}

function createViewportNodeFromBlock(contentId, block, ts) {
  const signature = viewportSignature(contentId, block);
  return ensureViewportTimelineNode(signature, block, ts);
}

async function loadViewportIntoTimeline(nodeId, block, runId) {
  const node = state.timelineNodes.get(nodeId);
  if (!node || node.loadStarted || node.html) {
    return;
  }

  const requestRunId = String(runId || '');
  if (node.lastLoadRunId === requestRunId) {
    return;
  }

  node.loadStarted = true;
  node.lastLoadRunId = requestRunId;
  node.loading = true;
  node.error = '';
  renderMessages({ nodeId, stickToBottom: false });

  try {
    const response = await getViewport(block.key, state.chatId || undefined, runId || undefined);
    const html = response.data?.html;
    if (typeof html !== 'string' || !html.trim()) {
      throw new Error('Viewport response does not contain html');
    }

    node.html = html;
    node.loading = false;
    node.error = '';
  } catch (error) {
    node.loading = false;
    node.error = `viewport failed: ${error.message}`;
  } finally {
    node.loadStarted = false;
    renderMessages({ nodeId, stickToBottom: false });
  }
}

function processViewportBlocks(contentId, text, runId, ts) {
  if (typeof text !== 'string' || !text.includes('```viewport')) {
    return;
  }

  const blocks = parseViewportBlocks(text).filter((block) => block.type === 'html');
  for (const block of blocks) {
    const signature = viewportSignature(contentId, block);
    const existingNodeId = state.viewportNodesBySignature.get(signature);
    if (existingNodeId) {
      loadViewportIntoTimeline(existingNodeId, block, runId).catch((error) => {
        appendDebug(`viewport timeline render failed: ${error.message}`);
      });
      continue;
    }

    const node = createViewportNodeFromBlock(contentId, block, ts);
    renderMessages({ nodeId: node.id, stickToBottom: true });
    loadViewportIntoTimeline(node.id, block, runId).catch((error) => {
      appendDebug(`viewport timeline render failed: ${error.message}`);
    });
    renderViewportBlock(block, runId).catch((error) => {
      appendDebug(`viewport debug render failed: ${error.message}`);
    });
  }
}

function applyAction(actionId, actionName, args) {
  if (!actionId || state.executedActionIds.has(actionId)) {
    return;
  }
  state.executedActionIds.add(actionId);
  actionRuntime.execute(actionName, args);
}

function handleActionStart(event) {
  const actionId = event.actionId;
  if (!actionId) {
    return;
  }

  const current = state.actionStates.get(actionId) || {
    actionId,
    actionName: event.actionName || 'unknown',
    argsBuffer: ''
  };

  current.actionName = event.actionName || current.actionName;
  state.actionStates.set(actionId, current);
}

function resolveReasoningKey(event, type) {
  if (event.reasoningId) {
    state.activeReasoningKey = String(event.reasoningId);
    return state.activeReasoningKey;
  }

  if (type === 'reasoning.start' || !state.activeReasoningKey) {
    state.activeReasoningKey = `implicit:${nextTimelineNodeId('reasoning')}`;
  }

  return state.activeReasoningKey;
}

function handleReasoningEvent(event, type) {
  const key = resolveReasoningKey(event, type);
  const node = ensureReasoningNode(key, event.timestamp || Date.now());

  if (type === 'reasoning.start') {
    if (event.text) {
      node.text = event.text;
    }
    node.status = 'running';
  }

  if (type === 'reasoning.delta') {
    node.text = `${node.text || ''}${event.delta || ''}`;
    node.status = 'running';
  }

  if (type === 'reasoning.snapshot') {
    node.text = event.text || node.text || '';
    node.status = 'completed';
    state.activeReasoningKey = '';
  }

  node.ts = event.timestamp || node.ts;
  return node;
}

function handleToolStart(event) {
  const toolId = event.toolId;
  if (!toolId) {
    return;
  }

  const toolState = state.toolStates.get(toolId) || {
    toolId,
    argsBuffer: '',
    toolName: event.toolName || '',
    toolType: event.toolType || '',
    toolApi: event.toolApi || '',
    toolParams: event.toolParams || null,
    description: event.description || '',
    runId: event.runId || state.runId
  };

  toolState.toolName = event.toolName || toolState.toolName;
  toolState.toolType = event.toolType || toolState.toolType;
  toolState.toolApi = event.toolApi || toolState.toolApi;
  toolState.toolParams = event.toolParams || toolState.toolParams;
  toolState.description = event.description || toolState.description;
  toolState.runId = event.runId || toolState.runId;

  state.toolStates.set(toolId, toolState);

  ensureToolTimelineNode(toolId, {
    toolName: toolState.toolName || toolId,
    toolApi: toolState.toolApi || '',
    description: toolState.description || '',
    argsText: toolState.toolParams ? toPrettyJson(toolState.toolParams, '{}') : '{}',
    status: 'running',
    ts: event.timestamp || Date.now()
  });

  if ((event.toolType || '').toLowerCase() === 'frontend') {
    const key = `${toolState.runId || state.runId}#${toolId}`;
    state.pendingTools.set(key, {
      key,
      runId: toolState.runId || state.runId,
      toolId,
      toolName: toolState.toolName,
      toolApi: toolState.toolApi,
      description: toolState.description,
      payloadText: JSON.stringify(
        {
          params: toolState.toolParams && typeof toolState.toolParams === 'object' ? toolState.toolParams : {}
        },
        null,
        2
      ),
      status: 'pending',
      statusText: 'pending'
    });
    renderPendingTools();
  }
}

function handleAgwEvent(event) {
  if (!event || typeof event !== 'object') {
    return;
  }

  state.events.push(event);
  if (state.events.length > MAX_EVENTS) {
    state.events.shift();
  }

  appendDebug(event);

  const type = event.type || 'unknown';

  if (event.chatId) {
    state.chatId = event.chatId;
    updateChatChip();
    renderChats();
  }

  if (type === 'request.query') {
    state.requestId = event.requestId || state.requestId;
    const id = `user:${event.requestId || state.events.length}`;
    upsertMessage(id, 'user', event.message || '', event.timestamp || Date.now());
    const nodeId = state.timelineNodeByMessageId.get(id);
    renderMessages({ nodeId, stickToBottom: true });
  }

  if (type === 'run.start') {
    state.runId = event.runId || state.runId;
    setStatus(`run.start ${state.runId}`);
  }

  if (type === 'run.complete') {
    state.runId = event.runId || state.runId;
    setStatus(`run.complete (${event.finishReason || 'end_turn'})`);
    state.streaming = false;
    refreshChats().catch((error) => appendDebug(`refresh chats failed: ${error.message}`));
  }

  if (type === 'run.error') {
    state.streaming = false;
    const id = `sys:error:${Date.now()}`;
    upsertMessage(id, 'system', `run.error: ${JSON.stringify(event.error || {}, null, 2)}`, Date.now());
    const nodeId = state.timelineNodeByMessageId.get(id);
    renderMessages({ nodeId, stickToBottom: true });
    setStatus('run.error', 'error');
  }

  if (type === 'run.cancel') {
    state.streaming = false;
    const id = `sys:cancel:${Date.now()}`;
    upsertMessage(id, 'system', 'run.cancel', Date.now());
    const nodeId = state.timelineNodeByMessageId.get(id);
    renderMessages({ nodeId, stickToBottom: true });
    setStatus('run.cancel', 'error');
  }

  if (type === 'plan.update') {
    state.plan = {
      planId: event.planId,
      plan: Array.isArray(event.plan) ? event.plan : []
    };

    if (state.planManualOverride === true) {
      state.planExpanded = true;
      clearPlanAutoCollapseTimer();
    } else if (state.planManualOverride === false) {
      state.planExpanded = false;
      clearPlanAutoCollapseTimer();
    } else {
      state.planExpanded = true;
      schedulePlanAutoCollapse();
    }

    renderPlan();
  }

  if (type === 'reasoning.start' || type === 'reasoning.delta' || type === 'reasoning.snapshot') {
    const node = handleReasoningEvent(event, type);
    renderMessages({ nodeId: node?.id, stickToBottom: true });
  }

  if (type === 'content.start' && event.contentId) {
    const messageId = `assistant:${event.contentId}`;
    upsertMessage(messageId, 'assistant', '', event.timestamp || Date.now());
    const nodeId = state.timelineNodeByMessageId.get(messageId);
    renderMessages({ nodeId, stickToBottom: true });
  }

  if (type === 'content.delta' && event.contentId) {
    const messageId = `assistant:${event.contentId}`;
    appendMessageText(messageId, 'assistant', event.delta || '', event.timestamp || Date.now());
    const nodeId = state.timelineNodeByMessageId.get(messageId);
    renderMessages({ nodeId, stickToBottom: true });

    const message = state.messagesById.get(messageId);
    if (message?.text) {
      processViewportBlocks(event.contentId, message.text, state.runId, event.timestamp || Date.now());
    }
  }

  if (type === 'content.snapshot' && event.contentId) {
    const messageId = `assistant:${event.contentId}`;
    upsertMessage(messageId, 'assistant', event.text || '', event.timestamp || Date.now());
    const nodeId = state.timelineNodeByMessageId.get(messageId);
    renderMessages({ nodeId, stickToBottom: true });
    processViewportBlocks(event.contentId, event.text || '', state.runId, event.timestamp || Date.now());
  }

  if (type === 'tool.start') {
    handleToolStart(event);
    const nodeId = state.toolNodeById.get(event.toolId);
    renderMessages({ nodeId, stickToBottom: true });
  }

  if (type === 'tool.args' && event.toolId) {
    const current = state.toolStates.get(event.toolId) || {
      toolId: event.toolId,
      argsBuffer: '',
      runId: state.runId,
      toolName: event.toolName || event.toolId,
      toolApi: event.toolApi || '',
      description: event.description || ''
    };
    current.toolName = event.toolName || current.toolName || event.toolId;
    current.toolApi = event.toolApi || current.toolApi || '';
    current.description = event.description || current.description || '';
    current.argsBuffer += event.delta || '';
    state.toolStates.set(event.toolId, current);

    const node = ensureToolTimelineNode(event.toolId, {
      toolName: current.toolName,
      toolApi: current.toolApi,
      description: current.description,
      argsText: current.argsBuffer || '{}',
      status: 'running',
      ts: event.timestamp || Date.now()
    });
    node.argsText = current.argsBuffer || node.argsText || '{}';
    node.status = 'running';
    node.ts = event.timestamp || node.ts;
    renderMessages({ nodeId: node.id, stickToBottom: true });
  }

  if (type === 'tool.snapshot' && event.toolId) {
    const current = state.toolStates.get(event.toolId) || {
      toolId: event.toolId,
      argsBuffer: '',
      runId: state.runId,
      toolName: event.toolName || event.toolId,
      toolApi: event.toolApi || '',
      description: event.description || ''
    };
    current.toolName = event.toolName || current.toolName || event.toolId;
    current.toolApi = event.toolApi || current.toolApi || '';
    current.description = event.description || current.description || '';
    current.toolParams = event.toolParams && typeof event.toolParams === 'object'
      ? event.toolParams
      : current.toolParams;
    state.toolStates.set(event.toolId, current);

    const argsText = current.toolParams
      ? toPrettyJson(current.toolParams, '{}')
      : toPrettyJson(current.argsBuffer, '{}');

    const node = ensureToolTimelineNode(event.toolId, {
      toolName: current.toolName,
      toolApi: current.toolApi,
      description: current.description,
      argsText,
      status: 'running',
      ts: event.timestamp || Date.now()
    });
    node.argsText = argsText;
    node.status = 'running';
    node.ts = event.timestamp || node.ts;
    renderMessages({ nodeId: node.id, stickToBottom: true });

    const payloadText = JSON.stringify(
      {
        params: event.toolParams && typeof event.toolParams === 'object' ? event.toolParams : {}
      },
      null,
      2
    );

    if ((event.toolType || '').toLowerCase() === 'frontend') {
      const key = `${state.runId}#${event.toolId}`;
      state.pendingTools.set(key, {
        key,
        runId: state.runId,
        toolId: event.toolId,
        toolName: event.toolName || event.toolId,
        toolApi: event.toolApi || '',
        description: event.description || '',
        payloadText,
        status: 'pending',
        statusText: 'pending(snapshot)'
      });
      renderPendingTools();
    }
  }

  if (type === 'tool.result' && event.toolId) {
    const current = state.toolStates.get(event.toolId) || {
      toolId: event.toolId,
      argsBuffer: '',
      runId: state.runId,
      toolName: event.toolName || event.toolId,
      toolApi: event.toolApi || '',
      description: event.description || ''
    };
    current.toolName = event.toolName || current.toolName || event.toolId;
    current.toolApi = event.toolApi || current.toolApi || '';
    current.description = event.description || current.description || '';
    state.toolStates.set(event.toolId, current);

    const resultValue = Object.prototype.hasOwnProperty.call(event, 'result')
      ? event.result
      : (event.output ?? event.text ?? '');

    const resultPayload = toToolResultPayload(resultValue);
    const node = ensureToolTimelineNode(event.toolId, {
      toolName: current.toolName,
      toolApi: current.toolApi,
      description: current.description,
      status: event.error ? 'failed' : 'completed',
      ts: event.timestamp || Date.now()
    });

    if (resultPayload) {
      node.result = resultPayload;
    }
    node.status = event.error ? 'failed' : 'completed';
    node.ts = event.timestamp || node.ts;
    renderMessages({ nodeId: node.id, stickToBottom: true });
  }

  if (type === 'tool.end' && event.toolId) {
    const node = ensureToolTimelineNode(event.toolId, {
      status: 'completed',
      ts: event.timestamp || Date.now()
    });
    if (!node.result) {
      node.status = event.error ? 'failed' : 'completed';
    }
    node.ts = event.timestamp || node.ts;
    renderMessages({ nodeId: node.id, stickToBottom: true });
  }

  if (type === 'action.start') {
    handleActionStart(event);
  }

  if (type === 'action.args' && event.actionId) {
    const current = state.actionStates.get(event.actionId) || {
      actionId: event.actionId,
      actionName: 'unknown',
      argsBuffer: ''
    };
    current.actionName = event.actionName || current.actionName;
    current.argsBuffer += event.delta || '';
    state.actionStates.set(event.actionId, current);
  }

  if (type === 'action.end' && event.actionId) {
    const action = state.actionStates.get(event.actionId);
    if (action) {
      const parsed = safeJsonParse(action.argsBuffer, {});
      applyAction(event.actionId, action.actionName || 'unknown', parsed);
    }
  }

  if (type === 'action.snapshot' && event.actionId) {
    const parsed = safeJsonParse(event.arguments || '', {});
    applyAction(event.actionId, event.actionName || 'unknown', parsed);
  }

  renderEvents();
}

async function refreshAgents() {
  const response = await getAgents();
  state.agents = Array.isArray(response.data) ? response.data : [];
  renderAgents();
  updateMentionSuggestions();
  setStatus(`agents loaded: ${state.agents.length}`);
}

async function refreshChats() {
  const response = await getChats();
  state.chats = Array.isArray(response.data) ? response.data : [];
  renderChats();
}

async function loadChat(chatId, includeRawMessages = false) {
  if (!chatId) {
    return;
  }

  setStatus(`loading chat ${chatId}...`);
  const response = await getChat(chatId, includeRawMessages);
  state.chatId = chatId;
  updateChatChip();

  resetConversationState();

  const events = Array.isArray(response.data?.events) ? response.data.events : [];
  for (const event of events) {
    handleAgwEvent(event);
  }

  const rawMessages = response.data?.rawMessages || response.data?.messages;
  if (includeRawMessages && Array.isArray(rawMessages)) {
    appendDebug({ type: 'rawMessages', count: rawMessages.length });
  }

  renderChats();
  closeDrawers();
  setStatus(`chat loaded: ${chatId}`);
}

function startNewChat() {
  if (state.streaming) {
    stopStreaming();
  }

  state.chatId = '';
  state.runId = '';
  state.requestId = '';
  updateChatChip();
  resetConversationState();
  renderChats();
  closeDrawers();
  setStatus('new chat ready');
}

function stopStreaming() {
  if (state.abortController) {
    state.abortController.abort();
    state.abortController = null;
  }
  state.streaming = false;
  setStatus('stream stopped');
}

function parseQueryError(status, text) {
  try {
    const json = JSON.parse(text);
    return json?.msg ? `${json.msg} (HTTP ${status})` : `HTTP ${status}: ${text}`;
  } catch (_error) {
    return `HTTP ${status}: ${text}`;
  }
}

async function sendMessage(inputMessage) {
  const rawMessage = String(inputMessage ?? elements.messageInput.value ?? '');
  const mention = parseLeadingAgentMention(rawMessage, state.agents);

  if (mention.error) {
    setStatus(`mention error: ${mention.error}`, 'error');
    return;
  }

  const message = mention.cleanMessage.trim();
  if (!message) {
    setStatus('消息为空，无法发送', 'error');
    return;
  }

  if (state.streaming) {
    setStatus('streaming in progress, stop first', 'error');
    return;
  }

  elements.messageInput.value = '';
  closeMentionSuggestions();

  resetRunTransientState();
  const controller = new AbortController();
  state.abortController = controller;
  state.streaming = true;

  const requestAgentKey = mention.mentionAgentKey || state.selectedAgentLocked || undefined;
  if (mention.mentionAgentKey) {
    setStatus(`query streaming via @${mention.mentionAgentKey}...`);
  } else if (state.selectedAgentLocked) {
    setStatus(`query streaming via locked @${state.selectedAgentLocked}...`);
  } else {
    setStatus('query streaming...');
  }

  try {
    const response = await createQueryStream({
      message,
      agentKey: requestAgentKey,
      chatId: state.chatId || undefined,
      signal: controller.signal
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new ApiError(parseQueryError(response.status, bodyText), { status: response.status });
    }

    await consumeJsonSseStream(response, {
      signal: controller.signal,
      onComment: (comments) => {
        if (comments.some((item) => String(item).includes('heartbeat'))) {
          return;
        }
        appendDebug(`sse-comment: ${comments.join('|')}`);
      },
      onJson: (jsonEvent) => {
        handleAgwEvent(jsonEvent);
      },
      onParseError: (_error, rawData) => {
        appendDebug(`sse-json-parse-failed: ${rawData}`);
      }
    });

    setStatus('stream ended');
  } catch (error) {
    if (controller.signal.aborted) {
      setStatus('stream aborted');
    } else {
      const id = `sys:error:${Date.now()}`;
      upsertMessage(id, 'system', `query failed: ${error.message}`, Date.now());
      const nodeId = state.timelineNodeByMessageId.get(id);
      renderMessages({ nodeId, stickToBottom: true });
      setStatus(`query failed: ${error.message}`, 'error');
    }
  } finally {
    state.streaming = false;
    state.abortController = null;
  }
}

async function submitPendingTool(key) {
  const pending = state.pendingTools.get(key);
  if (!pending) {
    return;
  }

  try {
    const payload = JSON.parse(pending.payloadText || '{}');

    if (!state.chatId || !pending.runId || !pending.toolId) {
      throw new Error('chatId/runId/toolId is missing, cannot submit');
    }

    const response = await submitTool({
      requestId: createRequestId('req_submit'),
      chatId: state.chatId,
      runId: pending.runId,
      toolId: pending.toolId,
      viewId: `${pending.toolId}_view`,
      payload
    });

    appendDebug({ type: 'submit.response', data: response.data });

    state.pendingTools.delete(key);
    renderPendingTools();
    setStatus(`submit accepted: ${pending.toolId}`);
  } catch (error) {
    pending.status = 'error';
    pending.statusText = error.message;
    renderPendingTools();
    setStatus(`submit failed: ${error.message}`, 'error');
  }
}

function bindDomEvents() {
  elements.refreshAgentsBtn.addEventListener('click', () => {
    refreshAgents().catch((error) => {
      setStatus(`refresh agents failed: ${error.message}`, 'error');
    });
  });

  elements.refreshChatsBtn.addEventListener('click', () => {
    refreshChats().catch((error) => {
      setStatus(`refresh chats failed: ${error.message}`, 'error');
    });
  });

  elements.loadRawBtn.addEventListener('click', () => {
    if (!state.chatId) {
      setStatus('current chatId is empty', 'error');
      return;
    }

    loadChat(state.chatId, true).catch((error) => {
      setStatus(`load raw chat failed: ${error.message}`, 'error');
    });
  });

  elements.stopStreamBtn.addEventListener('click', () => {
    stopStreaming();
  });

  elements.themeToggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    actionRuntime.setTheme(next);
  });

  elements.agentSelect.addEventListener('change', (event) => {
    state.selectedAgentLocked = String(event.target.value || '').trim();
    renderAgentLock();
  });

  elements.agentClearBtn.addEventListener('click', () => {
    state.selectedAgentLocked = '';
    elements.agentSelect.value = '';
    renderAgentLock();
  });

  elements.newChatBtn.addEventListener('click', () => {
    startNewChat();
  });

  elements.chatSearchInput.addEventListener('input', (event) => {
    state.chatFilter = event.target.value || '';
    renderChats();
  });

  elements.settingsToggleBtn.addEventListener('click', () => {
    setSettingsOpen(true);
  });

  elements.settingsCloseBtn.addEventListener('click', () => {
    setSettingsOpen(false);
  });

  elements.settingsModal.addEventListener('click', (event) => {
    if (event.target === elements.settingsModal) {
      setSettingsOpen(false);
    }
  });

  elements.openLeftDrawerBtn.addEventListener('click', () => {
    if (state.layoutMode !== 'mobile-drawer') {
      return;
    }
    state.leftDrawerOpen = true;
    state.rightDrawerOpen = false;
    syncDrawerState();
  });

  elements.openRightDrawerBtn.addEventListener('click', () => {
    if (state.layoutMode === 'desktop-fixed') {
      return;
    }
    state.rightDrawerOpen = true;
    if (state.layoutMode === 'mobile-drawer') {
      state.leftDrawerOpen = false;
    }
    syncDrawerState();
  });

  elements.leftDrawerCloseBtn.addEventListener('click', () => {
    if (state.layoutMode !== 'mobile-drawer') {
      return;
    }
    state.leftDrawerOpen = false;
    syncDrawerState();
  });

  elements.rightDrawerCloseBtn.addEventListener('click', () => {
    if (state.layoutMode === 'desktop-fixed') {
      return;
    }
    state.rightDrawerOpen = false;
    syncDrawerState();
  });

  elements.drawerOverlay.addEventListener('click', () => {
    closeDrawers();
  });

  elements.planToggleBtn.addEventListener('click', () => {
    setPlanExpanded(!state.planExpanded, { manual: true });
  });

  elements.messages.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) {
      return;
    }

    const action = trigger.getAttribute('data-action');
    if (action !== 'toggle-thinking' && action !== 'toggle-tool') {
      return;
    }

    const nodeId = trigger.getAttribute('data-node-id');
    if (!nodeId) {
      return;
    }

    const node = state.timelineNodes.get(nodeId);
    if (!node) {
      return;
    }

    if (action === 'toggle-thinking' && node.kind === 'thinking') {
      node.expanded = !node.expanded;
      renderMessages({ nodeId: node.id, stickToBottom: false });
      return;
    }

    if (action === 'toggle-tool' && node.kind === 'tool') {
      node.expanded = !node.expanded;
      renderMessages({ nodeId: node.id, stickToBottom: false });
    }
  });

  elements.debugTabs.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.getAttribute('data-debug-tab');
      setDebugTab(tab);
    });
  });

  elements.viewportToggleBtn.addEventListener('click', () => {
    setViewportExpanded(!state.viewportExpanded);
  });

  elements.chatsList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-chat-id]');
    if (!button) {
      return;
    }

    const chatId = button.getAttribute('data-chat-id');
    if (!chatId) {
      return;
    }

    loadChat(chatId).catch((error) => {
      setStatus(`load chat failed: ${error.message}`, 'error');
    });
  });

  elements.sendBtn.addEventListener('click', () => {
    sendMessage().catch((error) => {
      setStatus(`send failed: ${error.message}`, 'error');
    });
  });

  elements.messageInput.addEventListener('input', () => {
    updateMentionSuggestions();
  });

  elements.messageInput.addEventListener('keydown', (event) => {
    if (state.mentionOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        state.mentionActiveIndex = (state.mentionActiveIndex + 1) % state.mentionSuggestions.length;
        renderMentionSuggestions();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        state.mentionActiveIndex = (state.mentionActiveIndex - 1 + state.mentionSuggestions.length) % state.mentionSuggestions.length;
        renderMentionSuggestions();
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        selectMentionByIndex(state.mentionActiveIndex);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        closeMentionSuggestions();
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        selectMentionByIndex(state.mentionActiveIndex);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage().catch((error) => {
        setStatus(`send failed: ${error.message}`, 'error');
      });
    }
  });

  elements.mentionSuggestList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mention-index]');
    if (!button) {
      return;
    }

    const index = Number(button.getAttribute('data-mention-index'));
    if (!Number.isInteger(index)) {
      return;
    }

    selectMentionByIndex(index);
  });

  elements.pendingTools.addEventListener('input', (event) => {
    const textarea = event.target.closest('textarea[data-role="pending-payload"]');
    if (!textarea) {
      return;
    }

    const key = textarea.getAttribute('data-key');
    if (!key) {
      return;
    }

    const current = state.pendingTools.get(key);
    if (!current) {
      return;
    }

    current.payloadText = textarea.value;
  });

  elements.pendingTools.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action="submit-pending"]');
    if (!button) {
      return;
    }

    const key = button.getAttribute('data-key');
    if (!key) {
      return;
    }

    submitPendingTool(key).catch((error) => {
      setStatus(`submit failed: ${error.message}`, 'error');
    });
  });

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') {
      return;
    }

    if (data.type !== 'agw_chat_message') {
      return;
    }

    const message = typeof data.message === 'string' ? data.message.trim() : '';
    if (!message) {
      return;
    }

    elements.messageInput.value = message;
    closeMentionSuggestions();

    if (state.streaming) {
      stopStreaming();
      window.setTimeout(() => {
        sendMessage(message).catch((error) => {
          setStatus(`viewport relay send failed: ${error.message}`, 'error');
        });
      }, 80);
      return;
    }

    sendMessage(message).catch((error) => {
      setStatus(`viewport relay send failed: ${error.message}`, 'error');
    });
  });

  window.addEventListener('resize', () => {
    updateLayoutMode(window.innerWidth);
  });
}

async function bootstrap() {
  bindDomEvents();
  updateLayoutMode(window.innerWidth);
  updateChatChip();
  renderAgentLock();
  renderMessages({ full: true, stickToBottom: false });
  renderEvents();
  renderPlan();
  renderChats();
  renderPendingTools();
  renderDebugTabs();
  renderMentionSuggestions();
  setViewportExpanded(false);
  setSettingsOpen(false);
  syncDrawerState();

  try {
    await Promise.all([refreshAgents(), refreshChats()]);
    setStatus('ready');
  } catch (error) {
    setStatus(`bootstrap failed: ${error.message}`, 'error');
  }
}

bootstrap().catch((error) => {
  setStatus(`fatal: ${error.message}`, 'error');
});
