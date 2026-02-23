import './styles.css';

import {
  ApiError,
  createQueryStream,
  getAgents,
  getChat,
  getChats,
  setAccessToken,
  getViewport,
  submitTool
} from './lib/apiClient.js';
import { createActionRuntime, safeJsonParse } from './lib/actionRuntime.js';
import { parseFrontendToolParams } from './lib/frontendToolParams.js';
import { parseLeadingAgentMention, parseLeadingMentionDraft } from './lib/mentionParser.js';
import { consumeJsonSseStream } from './lib/sseParser.js';
import { parseViewportBlocks } from './lib/viewportParser.js';

const PLAN_AUTO_COLLAPSE_MS = 4000;
const REASONING_AUTO_COLLAPSE_MS = 1500;
const MAX_EVENTS = 1000;
const MAX_DEBUG_LINES = 220;
const COMPOSER_MIN_LINES = 1;
const COMPOSER_MAX_LINES = 6;
const TABLET_BREAKPOINT = 768;
const MOBILE_BREAKPOINT = 1080;
const DESKTOP_FIXED_BREAKPOINT = 1280;
const DEBUG_TABS = ['events', 'logs', 'tools'];
const FRONTEND_VIEWPORT_TYPES = new Set(['html', 'qlc']);

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
  accessTokenInput: document.getElementById('access-token-input'),
  accessTokenApply: document.getElementById('access-token-apply'),
  accessTokenClear: document.getElementById('access-token-clear'),
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
  composerArea: document.querySelector('.composer-area'),
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
  composerPill: document.getElementById('composer-pill'),
  frontendToolContainer: document.getElementById('frontend-tool-container'),
  frontendToolFrame: document.getElementById('frontend-tool-frame'),
  frontendToolTitle: document.getElementById('frontend-tool-title'),
  frontendToolMeta: document.getElementById('frontend-tool-meta'),
  frontendToolStatus: document.getElementById('frontend-tool-status'),
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
  planRuntimeByTaskId: new Map(),
  planCurrentRunningTaskId: '',
  planLastTouchedTaskId: '',
  toolStates: new Map(),
  toolNodeById: new Map(),
  contentNodeById: new Map(),
  pendingTools: new Map(),
  reasoningNodeById: new Map(),
  reasoningCollapseTimers: new Map(),
  actionStates: new Map(),
  executedActionIds: new Set(),
  renderedViewportSignatures: new Set(),
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
  chatLoadSeq: 0,
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
  mentionActiveIndex: 0,
  activeFrontendTool: null,
  accessToken: ''
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

function applyAccessToken() {
  const normalized = normalizeRawAccessToken(elements.accessTokenInput.value);
  if (!normalized.ok) {
    setStatus(normalized.error, 'error');
    return;
  }

  state.accessToken = normalized.token;
  elements.accessTokenInput.value = normalized.token;
  setAccessToken(normalized.token);
  setStatus('Access Token 已应用');
}

function clearAccessToken() {
  state.accessToken = '';
  elements.accessTokenInput.value = '';
  setAccessToken('');
  setStatus('Access Token 已清空');
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

function normalizeFrontendToolType(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isFrontendToolEvent(event) {
  if (!event || typeof event !== 'object') {
    return false;
  }

  const toolType = normalizeFrontendToolType(event.toolType);
  return FRONTEND_VIEWPORT_TYPES.has(toolType) && Boolean(event.toolKey);
}

function frontendPendingKey(runId, toolId) {
  const rid = String(runId || '').trim();
  const tid = String(toolId || '').trim();
  if (!rid || !tid) {
    return '';
  }
  return `${rid}#${tid}`;
}

function toPendingParamsText(params) {
  return JSON.stringify(params && typeof params === 'object' ? params : {}, null, 2);
}

function tryParseJsonObject(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
}

function autosizeComposerInput() {
  const input = elements.messageInput;
  if (!input) {
    return;
  }

  const style = window.getComputedStyle(input);
  const lineHeight = Number.parseFloat(style.lineHeight) || 22;
  const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
  const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;
  const minHeight = Math.ceil(lineHeight * COMPOSER_MIN_LINES + borderTop + borderBottom);
  const maxHeight = Math.ceil(lineHeight * COMPOSER_MAX_LINES + borderTop + borderBottom);

  input.style.height = 'auto';
  const nextHeight = Math.max(minHeight, Math.min(input.scrollHeight, maxHeight));
  input.style.height = `${nextHeight}px`;
  input.style.overflowY = input.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function resolveToolParams(event, fallbackParams = null) {
  const parsed = parseFrontendToolParams(event);
  if (parsed.error) {
    appendDebug(parsed.error);
  }
  if (parsed.found && parsed.params && typeof parsed.params === 'object') {
    return parsed.params;
  }
  return fallbackParams && typeof fallbackParams === 'object' ? fallbackParams : {};
}

function syncFrontendToolParamsByState(toolState) {
  const runId = toolState?.runId || state.runId;
  const toolId = toolState?.toolId;
  if (!runId || !toolId) {
    return;
  }
  if (!isFrontendToolEvent({ toolType: toolState.toolType, toolKey: toolState.toolKey })) {
    return;
  }
  if (!toolState.toolParams || typeof toolState.toolParams !== 'object') {
    return;
  }

  const key = frontendPendingKey(runId, toolId);
  const pending = state.pendingTools.get(key);
  if (pending) {
    pending.payloadText = toPendingParamsText(toolState.toolParams);
    state.pendingTools.set(key, pending);
    renderPendingTools();
  }

  if (state.activeFrontendTool && state.activeFrontendTool.key === key) {
    state.activeFrontendTool.toolParams = toolState.toolParams;
    try {
      postInitMessageToFrontendToolFrame();
    } catch (error) {
      appendDebug(`frontend tool init postMessage failed: ${error.message}`);
    }
  }
}

function setComposerFrontendLocked(locked) {
  const active = Boolean(locked);
  elements.composerArea.classList.toggle('is-frontend-active', active);
  elements.messageInput.disabled = active;
  elements.sendBtn.disabled = active;
  elements.composerPill.classList.toggle('hidden', active);
  elements.frontendToolContainer.classList.toggle('hidden', !active);
  elements.messageInput.setAttribute('aria-disabled', String(active));
  elements.app.classList.toggle('frontend-tool-active', active);
  elements.messageInput.placeholder = active
    ? '前端工具处理中，请在确认面板内提交'
    : '回复消息...（Enter 发送，Shift+Enter 换行）';
  elements.messages.setAttribute('aria-busy', String(active));

  if (active) {
    closeMentionSuggestions();
    elements.composerPill.blur();
  }

  autosizeComposerInput();
}

function setFrontendToolStatus(text, tone = 'normal') {
  elements.frontendToolStatus.textContent = text;
  elements.frontendToolStatus.classList.toggle('ok', tone === 'ok');
  elements.frontendToolStatus.classList.toggle('err', tone === 'error');
}

function buildFrontendToolInitPayload(tool) {
  return {
    runId: tool.runId,
    toolId: tool.toolId,
    toolKey: tool.toolKey,
    toolType: tool.toolType,
    toolTimeout: tool.toolTimeout,
    params: tool.toolParams && typeof tool.toolParams === 'object' ? tool.toolParams : {}
  };
}

function postInitMessageToFrontendToolFrame() {
  const active = state.activeFrontendTool;
  if (!active || !elements.frontendToolFrame.contentWindow) {
    return;
  }

  elements.frontendToolFrame.contentWindow.postMessage(
    {
      type: 'tool_init',
      data: buildFrontendToolInitPayload(active)
    },
    '*'
  );
}

function renderActiveFrontendTool() {
  const active = state.activeFrontendTool;
  if (!active) {
    setComposerFrontendLocked(false);
    elements.frontendToolTitle.textContent = '';
    elements.frontendToolMeta.textContent = '';
    elements.frontendToolFrame.removeAttribute('srcdoc');
    setFrontendToolStatus('', 'normal');
    return;
  }

  setComposerFrontendLocked(true);
  elements.frontendToolTitle.textContent = '';
  elements.frontendToolMeta.textContent = '';
  setFrontendToolStatus('', 'normal');

  if (active.loadError) {
    setStatus(active.loadError, 'error');
  }

  if (active.viewportHtml && elements.frontendToolFrame.srcdoc !== active.viewportHtml) {
    const expectedKey = active.key;
    elements.frontendToolFrame.onload = () => {
      if (!state.activeFrontendTool || state.activeFrontendTool.key !== expectedKey) {
        return;
      }
      try {
        postInitMessageToFrontendToolFrame();
      } catch (error) {
        appendDebug(`frontend tool init postMessage failed: ${error.message}`);
      }
    };
    elements.frontendToolFrame.srcdoc = active.viewportHtml;
  } else if (active.viewportHtml) {
    try {
      postInitMessageToFrontendToolFrame();
    } catch (error) {
      appendDebug(`frontend tool init postMessage failed: ${error.message}`);
    }
  } else {
    elements.frontendToolFrame.removeAttribute('srcdoc');
  }
}

function clearActiveFrontendTool() {
  state.activeFrontendTool = null;
  renderActiveFrontendTool();
}

async function loadActiveFrontendToolViewport(expectedKey) {
  const active = state.activeFrontendTool;
  if (!active || active.key !== expectedKey) {
    return;
  }

  try {
    const response = await getViewport(active.toolKey);
    if (!state.activeFrontendTool || state.activeFrontendTool.key !== expectedKey) {
      return;
    }

    const payload = response.data;
    const html = typeof payload?.html === 'string'
      ? payload.html
      : `<html><body><pre>${escapeHtml(JSON.stringify(payload ?? {}, null, 2))}</pre></body></html>`;

    state.activeFrontendTool.viewportHtml = html;
    state.activeFrontendTool.loading = false;
    state.activeFrontendTool.loadError = '';
    renderActiveFrontendTool();
  } catch (error) {
    if (!state.activeFrontendTool || state.activeFrontendTool.key !== expectedKey) {
      return;
    }
    state.activeFrontendTool.loading = false;
    state.activeFrontendTool.loadError = `前端工具加载失败: ${error.message}`;
    renderActiveFrontendTool();
  }
}

function upsertPendingFrontendTool(toolState, statusText = 'pending') {
  const key = frontendPendingKey(toolState.runId || state.runId, toolState.toolId);
  if (!key) {
    return;
  }

  state.pendingTools.set(key, {
    key,
    runId: toolState.runId || state.runId,
    toolId: toolState.toolId,
    toolName: toolState.toolName,
    toolApi: toolState.toolApi,
    toolKey: toolState.toolKey || '',
    toolType: normalizeFrontendToolType(toolState.toolType),
    description: toolState.description,
    payloadText: toPendingParamsText(toolState.toolParams),
    status: 'pending',
    statusText
  });
  renderPendingTools();
}

function activateFrontendTool(toolState) {
  const runId = toolState.runId || state.runId;
  const toolId = toolState.toolId;
  const toolKey = toolState.toolKey;
  const toolType = normalizeFrontendToolType(toolState.toolType);
  if (!runId || !toolId || !toolKey || !FRONTEND_VIEWPORT_TYPES.has(toolType)) {
    return;
  }

  const key = frontendPendingKey(runId, toolId);
  const previous = state.activeFrontendTool;
  const sameTool = Boolean(previous && previous.key === key);
  const shouldReload = !sameTool || previous.toolKey !== toolKey || !previous.viewportHtml;

  state.activeFrontendTool = {
    ...(sameTool ? previous : {}),
    key,
    runId,
    toolId,
    toolKey,
    toolType,
    toolName: toolState.toolName || toolKey,
    description: toolState.description || '',
    toolTimeout: Number.isFinite(Number(toolState.toolTimeout)) ? Number(toolState.toolTimeout) : null,
    toolParams: toolState.toolParams && typeof toolState.toolParams === 'object' ? toolState.toolParams : {},
    loading: shouldReload,
    loadError: shouldReload ? '' : (previous.loadError || ''),
    viewportHtml: shouldReload ? '' : (previous.viewportHtml || '')
  };

  renderActiveFrontendTool();

  if (shouldReload) {
    loadActiveFrontendToolViewport(key).catch((error) => {
      appendDebug(`frontend viewport load failed: ${error.message}`);
    });
  } else {
    try {
      postInitMessageToFrontendToolFrame();
    } catch (error) {
      appendDebug(`frontend tool init postMessage failed: ${error.message}`);
    }
  }
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

function clearReasoningCollapseTimer(reasoningKey) {
  const timerId = state.reasoningCollapseTimers.get(reasoningKey);
  if (!timerId) {
    return;
  }

  window.clearTimeout(timerId);
  state.reasoningCollapseTimers.delete(reasoningKey);
}

function clearAllReasoningCollapseTimers() {
  for (const reasoningKey of state.reasoningCollapseTimers.keys()) {
    clearReasoningCollapseTimer(reasoningKey);
  }
}

function scheduleReasoningAutoCollapse(reasoningKey, nodeId, delayMs = REASONING_AUTO_COLLAPSE_MS) {
  if (!reasoningKey || !nodeId) {
    return;
  }

  clearReasoningCollapseTimer(reasoningKey);
  const timerId = window.setTimeout(() => {
    state.reasoningCollapseTimers.delete(reasoningKey);
    const node = state.timelineNodes.get(nodeId);
    if (!node || node.kind !== 'thinking') {
      return;
    }

    node.expanded = false;
    renderMessages({ nodeId, stickToBottom: false });
  }, delayMs);

  state.reasoningCollapseTimers.set(reasoningKey, timerId);
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

function ensureContentTimelineNode(contentId, fallback = {}) {
  let nodeId = state.contentNodeById.get(contentId);
  if (!nodeId) {
    nodeId = `content:${contentId}:${nextTimelineNodeId('content')}`;
    state.contentNodeById.set(contentId, nodeId);
  }

  const node = ensureTimelineNode(nodeId, {
    kind: 'content',
    contentId,
    text: '',
    status: 'running',
    segments: [],
    embeddedViewports: {},
    ts: fallback.ts ?? Date.now()
  });

  node.kind = 'content';
  node.contentId = contentId;

  if (fallback.status) {
    node.status = fallback.status;
  }

  if (Object.prototype.hasOwnProperty.call(fallback, 'text')) {
    node.text = String(fallback.text ?? '');
  }

  if (Object.prototype.hasOwnProperty.call(fallback, 'appendText')) {
    node.text = `${node.text || ''}${String(fallback.appendText ?? '')}`;
  }

  if (!Array.isArray(node.segments)) {
    node.segments = [];
  }

  if (!node.embeddedViewports || typeof node.embeddedViewports !== 'object') {
    node.embeddedViewports = {};
  }

  node.ts = fallback.ts ?? node.ts;
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

function renderContentSegments(container, node) {
  const segments = Array.isArray(node.segments) ? node.segments : [];

  if (segments.length === 0) {
    const fallbackText = stripViewportBlocksFromText(node.text || '');
    if (fallbackText) {
      const textEl = document.createElement('div');
      textEl.className = 'timeline-text';
      textEl.textContent = fallbackText;
      container.append(textEl);
      return;
    }

    if (node.status !== 'completed') {
      const waiting = document.createElement('div');
      waiting.className = 'status-line';
      waiting.textContent = 'waiting content...';
      container.append(waiting);
    }
    return;
  }

  for (const segment of segments) {
    if (segment.kind === 'text') {
      const text = String(segment.text || '').trim();
      if (!text) {
        continue;
      }

      const textEl = document.createElement('div');
      textEl.className = 'timeline-text';
      textEl.textContent = text;
      container.append(textEl);
      continue;
    }

    if (segment.kind !== 'viewport') {
      continue;
    }

    const viewport = node.embeddedViewports?.[segment.signature];
    if (!viewport) {
      continue;
    }

    const viewportCard = document.createElement('section');
    viewportCard.className = 'timeline-content-viewport';

    const head = document.createElement('div');
    head.className = 'timeline-content-viewport-head';
    head.textContent = `viewport: ${viewport.key || '-'}`;
    viewportCard.append(head);

    const body = document.createElement('div');
    body.className = 'timeline-content-viewport-body';

    if (viewport.error) {
      body.innerHTML = `<div class="status-line">${escapeHtml(viewport.error)}</div>`;
      viewportCard.append(body);
      container.append(viewportCard);
      continue;
    }

    if (viewport.loading || !viewport.html) {
      body.innerHTML = '<div class="status-line">loading viewport...</div>';
      viewportCard.append(body);
      container.append(viewportCard);
      continue;
    }

    const iframe = document.createElement('iframe');
    iframe.className = 'timeline-content-viewport-frame';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.srcdoc = viewport.html;
    iframe.addEventListener('load', () => {
      try {
        const payload = viewport.payload ?? safeJsonParse(viewport.payloadRaw, {});
        iframe.contentWindow?.postMessage(payload, '*');
      } catch (error) {
        appendDebug(`content viewport postMessage failed: ${error.message}`);
      }
    });
    body.append(iframe);
    viewportCard.append(body);
    container.append(viewportCard);
  }
}

function patchTimelineNode(nodeId) {
  const node = state.timelineNodes.get(nodeId);
  const row = state.timelineDomCache.get(nodeId);

  if (!node || !row) {
    return;
  }

  row.classList.remove('hidden');

  if (node.kind === 'message' && node.role === 'user') {
    row.className = 'timeline-row timeline-row-user';
    row.innerHTML = `
      <div class="timeline-user-bubble">
        <div class="timeline-text">${escapeHtml(node.text || '')}</div>
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
      </div>
    `;
    return;
  }

  if (node.kind === 'content') {
    row.className = 'timeline-row timeline-row-flow';
    row.innerHTML = `
      <div class="timeline-marker"><span class="node-icon node-icon-assistant" aria-hidden="true"></span></div>
      <div class="timeline-flow-content">
        <div class="timeline-content-stack"></div>
      </div>
    `;

    const stack = row.querySelector('.timeline-content-stack');
    if (!stack) {
      return;
    }

    renderContentSegments(stack, node);
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
      </div>
    `;
    return;
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
  clearAllReasoningCollapseTimers();
  state.messagesById.clear();
  state.messageOrder = [];
  state.events = [];
  state.plan = null;
  state.planRuntimeByTaskId.clear();
  state.planCurrentRunningTaskId = '';
  state.planLastTouchedTaskId = '';
  state.planExpanded = false;
  state.planManualOverride = null;
  clearPlanAutoCollapseTimer();
  state.toolStates.clear();
  state.toolNodeById.clear();
  state.contentNodeById.clear();
  state.reasoningNodeById.clear();
  state.reasoningCollapseTimers.clear();
  state.pendingTools.clear();
  state.actionStates.clear();
  state.executedActionIds.clear();
  state.renderedViewportSignatures.clear();
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
  clearActiveFrontendTool();
  elements.viewportList.innerHTML = '';
  renderMessages({ full: true, stickToBottom: false });
  renderEvents();
  renderPlan();
  renderPendingTools();
}

function resetRunTransientState() {
  clearAllReasoningCollapseTimers();
  state.toolStates.clear();
  state.toolNodeById.clear();
  state.contentNodeById.clear();
  state.reasoningNodeById.clear();
  state.reasoningCollapseTimers.clear();
  state.activeReasoningKey = '';
  state.pendingTools.clear();
  state.actionStates.clear();
  state.executedActionIds.clear();
  clearActiveFrontendTool();
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

  if (['running', 'in_progress', 'working', 'doing'].includes(value)) {
    return 'running';
  }

  if (['failed', 'error'].includes(value)) {
    return 'failed';
  }

  if (['canceled', 'cancelled'].includes(value)) {
    return 'canceled';
  }

  if (['init', 'pending', 'todo'].includes(value)) {
    return 'pending';
  }

  return 'pending';
}

function normalizeTaskEventStatus(type) {
  if (type === 'task.start') {
    return 'running';
  }
  if (type === 'task.complete') {
    return 'completed';
  }
  if (type === 'task.cancel') {
    return 'canceled';
  }
  if (type === 'task.fail') {
    return 'failed';
  }
  return 'pending';
}

function syncPlanRuntime(planItems = []) {
  const nextRuntime = new Map();
  const normalizedItems = Array.isArray(planItems) ? planItems : [];
  for (const item of normalizedItems) {
    const taskId = String(item?.taskId || '').trim();
    if (!taskId) {
      continue;
    }
    const baseStatus = normalizePlanStatus(item.status);
    const existing = state.planRuntimeByTaskId.get(taskId);
    let mergedStatus = baseStatus;
    if (existing && mergedStatus === 'pending') {
      mergedStatus = existing.status || mergedStatus;
    }
    nextRuntime.set(taskId, {
      status: mergedStatus,
      updatedAt: existing?.updatedAt || Date.now(),
      error: existing?.error || ''
    });
  }
  state.planRuntimeByTaskId = nextRuntime;

  if (state.planCurrentRunningTaskId) {
    const running = state.planRuntimeByTaskId.get(state.planCurrentRunningTaskId);
    if (!running || running.status !== 'running') {
      state.planCurrentRunningTaskId = '';
    }
  }

  if (!state.planCurrentRunningTaskId) {
    const runningEntry = normalizedItems.find((item) => {
      const taskId = String(item?.taskId || '').trim();
      if (!taskId) {
        return false;
      }
      return state.planRuntimeByTaskId.get(taskId)?.status === 'running';
    });
    state.planCurrentRunningTaskId = runningEntry?.taskId || '';
  }
}

function applyTaskLifecycleEvent(event) {
  const taskId = String(event?.taskId || '').trim();
  if (!taskId) {
    return false;
  }
  const nextStatus = normalizeTaskEventStatus(event.type);
  const current = state.planRuntimeByTaskId.get(taskId) || {
    status: 'pending',
    updatedAt: Date.now(),
    error: ''
  };
  const next = {
    status: nextStatus,
    updatedAt: event.timestamp || Date.now(),
    error: event.type === 'task.fail'
      ? (typeof event.error === 'string' ? event.error : JSON.stringify(event.error || {}))
      : ''
  };
  state.planRuntimeByTaskId.set(taskId, next);
  state.planLastTouchedTaskId = taskId;

  if (event.type === 'task.start') {
    state.planCurrentRunningTaskId = taskId;
  } else if (state.planCurrentRunningTaskId === taskId) {
    state.planCurrentRunningTaskId = '';
  }

  if (state.plan && Array.isArray(state.plan.plan) && !state.plan.plan.some((item) => String(item?.taskId || '').trim() === taskId)) {
    state.plan.plan.push({
      taskId,
      description: event.description || event.taskName || '',
      status: next.status
    });
  } else if (state.plan && Array.isArray(state.plan.plan)) {
    state.plan.plan = state.plan.plan.map((item) => {
      if (String(item?.taskId || '').trim() !== taskId) {
        return item;
      }
      return {
        ...item,
        description: item.description || event.description || event.taskName || ''
      };
    });
  }

  return current.status !== next.status || current.error !== next.error;
}

function summarizePlan(planItems) {
  const normalized = planItems.map((item) => ({
    ...item,
    normalizedStatus: (() => {
      const taskId = String(item?.taskId || '').trim();
      const runtime = taskId ? state.planRuntimeByTaskId.get(taskId) : null;
      return normalizePlanStatus(runtime?.status || item.status);
    })()
  }));

  const completed = normalized.filter((item) => item.normalizedStatus === 'completed').length;
  const running = state.planCurrentRunningTaskId
    ? normalized.find((item) => String(item.taskId || '').trim() === state.planCurrentRunningTaskId)
    : normalized.find((item) => item.normalizedStatus === 'running');
  const pending = normalized.find((item) => item.normalizedStatus === 'pending');
  const failed = normalized.find((item) => item.normalizedStatus === 'failed');
  const canceled = normalized.find((item) => item.normalizedStatus === 'canceled');
  const lastTouched = state.planLastTouchedTaskId
    ? normalized.find((item) => String(item.taskId || '').trim() === state.planLastTouchedTaskId)
    : null;
  const focus = running || lastTouched || failed || pending || canceled || normalized[normalized.length - 1] || null;
  const focusIndex = focus ? (normalized.indexOf(focus) + 1) : 0;

  return {
    normalized,
    completed,
    current: focusIndex > 0 ? focusIndex : (normalized.length > 0 ? 1 : 0),
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
  elements.planSummaryStatus.textContent = `${planSummary.current}/${planSummary.total}`;
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
          <div>toolType/key: ${escapeHtml(tool.toolType || '-')} / ${escapeHtml(tool.toolKey || '-')}</div>
          <div>${escapeHtml(tool.description || '')}</div>
          <div class="mono">params</div>
          <textarea data-role="pending-params" data-key="${escapeHtml(tool.key)}">${escapeHtml(tool.payloadText)}</textarea>
          <button data-action="submit-pending" data-key="${escapeHtml(tool.key)}" type="button">Submit params /api/submit</button>
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
  autosizeComposerInput();
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
    const response = await getViewport(block.key);
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

function parseContentSegments(contentId, text) {
  const raw = String(text ?? '');
  if (!raw.trim()) {
    return [];
  }

  if (!raw.includes('```viewport')) {
    return [{ kind: 'text', text: raw.trim() }];
  }

  const segments = [];
  const regex = /```viewport[\s\S]*?```/gi;
  let cursor = 0;
  let match;

  while ((match = regex.exec(raw)) !== null) {
    const before = raw.slice(cursor, match.index);
    if (before.trim()) {
      segments.push({ kind: 'text', text: before.trim() });
    }

    const parsed = parseViewportBlocks(match[0]).find((block) => block.type === 'html');
    if (parsed) {
      segments.push({
        kind: 'viewport',
        signature: viewportSignature(contentId, parsed),
        key: parsed.key,
        payloadRaw: parsed.payloadRaw || '{}',
        payload: parsed.payload ?? safeJsonParse(parsed.payloadRaw, {})
      });
    } else if (match[0].trim()) {
      segments.push({ kind: 'text', text: match[0].trim() });
    }

    cursor = regex.lastIndex;
  }

  const tail = raw.slice(cursor);
  if (tail.trim()) {
    segments.push({ kind: 'text', text: tail.trim() });
  }

  if (segments.length === 0) {
    segments.push({ kind: 'text', text: raw.trim() });
  }

  return segments;
}

async function loadViewportIntoContentNode(nodeId, signature, runId) {
  const node = state.timelineNodes.get(nodeId);
  if (!node || node.kind !== 'content') {
    return;
  }

  const viewport = node.embeddedViewports?.[signature];
  if (!viewport || !viewport.key) {
    return;
  }

  const requestRunId = String(runId || '');
  if (viewport.loadStarted) {
    return;
  }

  if (viewport.html && viewport.lastLoadRunId === requestRunId) {
    return;
  }

  viewport.loadStarted = true;
  viewport.lastLoadRunId = requestRunId;
  viewport.loading = true;
  viewport.error = '';
  renderMessages({ nodeId, stickToBottom: false });

  try {
    const response = await getViewport(viewport.key);
    const html = response.data?.html;
    if (typeof html !== 'string' || !html.trim()) {
      throw new Error('Viewport response does not contain html');
    }

    viewport.html = html;
    viewport.loading = false;
    viewport.error = '';
  } catch (error) {
    viewport.loading = false;
    viewport.error = `viewport failed: ${error.message}`;
  } finally {
    viewport.loadStarted = false;
    renderMessages({ nodeId, stickToBottom: false });
  }
}

function processViewportBlocks(contentId, text, runId, ts) {
  const nodeId = state.contentNodeById.get(contentId);
  if (!nodeId) {
    return;
  }

  const node = state.timelineNodes.get(nodeId);
  if (!node || node.kind !== 'content') {
    return;
  }

  const segments = parseContentSegments(contentId, text);
  node.segments = segments;
  if (!node.embeddedViewports || typeof node.embeddedViewports !== 'object') {
    node.embeddedViewports = {};
  }

  const activeSignatures = new Set();
  for (const segment of segments) {
    if (segment.kind !== 'viewport') {
      continue;
    }

    const signature = segment.signature;
    activeSignatures.add(signature);

    const existing = node.embeddedViewports[signature] || {
      signature,
      key: segment.key,
      payload: segment.payload,
      payloadRaw: segment.payloadRaw,
      html: '',
      loading: false,
      error: '',
      loadStarted: false,
      lastLoadRunId: ''
    };

    existing.key = segment.key;
    existing.payload = segment.payload;
    existing.payloadRaw = segment.payloadRaw;
    existing.ts = ts ?? Date.now();
    node.embeddedViewports[signature] = existing;

    loadViewportIntoContentNode(nodeId, signature, runId).catch((error) => {
      appendDebug(`viewport embed load failed: ${error.message}`);
    });

    renderViewportBlock(
      {
        key: existing.key,
        payload: existing.payload,
        payloadRaw: existing.payloadRaw
      },
      runId
    ).catch((error) => {
      appendDebug(`viewport debug render failed: ${error.message}`);
    });
  }

  for (const signature of Object.keys(node.embeddedViewports)) {
    if (!activeSignatures.has(signature)) {
      delete node.embeddedViewports[signature];
    }
  }

  node.ts = ts ?? node.ts;
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

function handleReasoningEvent(event, type, source = 'live') {
  const key = resolveReasoningKey(event, type);
  const node = ensureReasoningNode(key, event.timestamp || Date.now());
  const isHistory = source === 'history';

  if (type === 'reasoning.start') {
    clearReasoningCollapseTimer(key);
    if (event.text) {
      node.text = event.text;
    }
    node.status = 'running';
    node.expanded = true;
  }

  if (type === 'reasoning.delta') {
    clearReasoningCollapseTimer(key);
    node.text = `${node.text || ''}${event.delta || ''}`;
    node.status = 'running';
    node.expanded = true;
  }

  if (type === 'reasoning.snapshot') {
    node.text = event.text || node.text || '';
    node.status = 'completed';
    state.activeReasoningKey = '';
    if (isHistory) {
      clearReasoningCollapseTimer(key);
      node.expanded = false;
    } else {
      node.expanded = true;
      scheduleReasoningAutoCollapse(key, node.id);
    }
  }

  if (type === 'reasoning.end') {
    if (event.text) {
      node.text = event.text;
    }
    node.status = 'completed';
    state.activeReasoningKey = '';
    if (isHistory) {
      clearReasoningCollapseTimer(key);
      node.expanded = false;
    } else {
      node.expanded = true;
      scheduleReasoningAutoCollapse(key, node.id);
    }
  }

  node.ts = event.timestamp || node.ts;
  return node;
}

function handleToolStart(event, source = 'live') {
  const toolId = event.toolId;
  if (!toolId) {
    return;
  }

  const toolState = state.toolStates.get(toolId) || {
    toolId,
    argsBuffer: '',
    toolName: event.toolName || '',
    toolType: event.toolType || '',
    toolKey: event.toolKey || '',
    toolTimeout: event.toolTimeout ?? null,
    toolApi: event.toolApi || '',
    toolParams: event.toolParams || null,
    description: event.description || '',
    runId: event.runId || state.runId
  };
  const resolvedParams = resolveToolParams(event, toolState.toolParams);

  toolState.toolName = event.toolName || toolState.toolName;
  toolState.toolType = event.toolType || toolState.toolType;
  toolState.toolKey = event.toolKey || toolState.toolKey;
  toolState.toolTimeout = event.toolTimeout ?? toolState.toolTimeout;
  toolState.toolApi = event.toolApi || toolState.toolApi;
  toolState.toolParams = resolvedParams;
  toolState.description = event.description || toolState.description;
  toolState.runId = event.runId || toolState.runId;

  state.toolStates.set(toolId, toolState);

  const node = ensureToolTimelineNode(toolId, {
    toolName: toolState.toolName || toolId,
    toolApi: toolState.toolApi || '',
    description: toolState.description || '',
    argsText: toolState.toolParams ? toPrettyJson(toolState.toolParams, '{}') : '{}',
    status: 'running',
    ts: event.timestamp || Date.now()
  });
  node.expanded = false;

  if (source !== 'history' && isFrontendToolEvent({
    toolType: toolState.toolType,
    toolKey: toolState.toolKey
  })) {
    upsertPendingFrontendTool(toolState, 'pending');
    activateFrontendTool(toolState);
  }
}

function handleAgwEvent(event, source = 'live') {
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
    clearActiveFrontendTool();
    refreshChats().catch((error) => appendDebug(`refresh chats failed: ${error.message}`));
  }

  if (type === 'run.error') {
    state.streaming = false;
    clearActiveFrontendTool();
    const id = `sys:error:${Date.now()}`;
    upsertMessage(id, 'system', `run.error: ${JSON.stringify(event.error || {}, null, 2)}`, Date.now());
    const nodeId = state.timelineNodeByMessageId.get(id);
    renderMessages({ nodeId, stickToBottom: true });
    setStatus('run.error', 'error');
  }

  if (type === 'run.cancel') {
    state.streaming = false;
    clearActiveFrontendTool();
    const id = `sys:cancel:${Date.now()}`;
    upsertMessage(id, 'system', 'run.cancel', Date.now());
    const nodeId = state.timelineNodeByMessageId.get(id);
    renderMessages({ nodeId, stickToBottom: true });
    setStatus('run.cancel', 'error');
  }

  if (type === 'plan.update') {
    const previousPlanId = state.plan?.planId || '';
    const nextPlanId = event.planId || '';
    if (previousPlanId && nextPlanId && previousPlanId !== nextPlanId) {
      state.planRuntimeByTaskId.clear();
      state.planCurrentRunningTaskId = '';
      state.planLastTouchedTaskId = '';
    }

    state.plan = {
      planId: event.planId,
      plan: Array.isArray(event.plan) ? event.plan : []
    };
    syncPlanRuntime(state.plan.plan);

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

  if (type === 'task.start' || type === 'task.complete' || type === 'task.cancel' || type === 'task.fail') {
    if (applyTaskLifecycleEvent(event)) {
      renderPlan();
    }
  }

  if (type === 'reasoning.start' || type === 'reasoning.delta' || type === 'reasoning.end' || type === 'reasoning.snapshot') {
    const node = handleReasoningEvent(event, type, source);
    renderMessages({ nodeId: node?.id, stickToBottom: true });
  }

  if (type === 'content.start' && event.contentId) {
    const contentId = String(event.contentId);
    const node = ensureContentTimelineNode(contentId, {
      text: typeof event.text === 'string' ? event.text : '',
      status: 'running',
      ts: event.timestamp || Date.now()
    });
    node.text = typeof event.text === 'string' ? event.text : '';
    node.status = 'running';
    node.ts = event.timestamp || node.ts;
    processViewportBlocks(contentId, node.text, event.runId || state.runId, node.ts);
    renderMessages({ nodeId: node.id, stickToBottom: true });
  }

  if (type === 'content.delta' && event.contentId) {
    const contentId = String(event.contentId);
    const node = ensureContentTimelineNode(contentId, {
      status: 'running',
      ts: event.timestamp || Date.now()
    });
    node.text = `${node.text || ''}${event.delta || ''}`;
    node.status = 'running';
    node.ts = event.timestamp || node.ts;
    processViewportBlocks(contentId, node.text, event.runId || state.runId, node.ts);
    renderMessages({ nodeId: node.id, stickToBottom: true });
  }

  if (type === 'content.end' && event.contentId) {
    const contentId = String(event.contentId);
    const node = ensureContentTimelineNode(contentId, {
      status: 'completed',
      ts: event.timestamp || Date.now()
    });
    if (typeof event.text === 'string' && event.text.trim()) {
      node.text = event.text;
    }
    node.status = 'completed';
    node.ts = event.timestamp || node.ts;
    processViewportBlocks(contentId, node.text, event.runId || state.runId, node.ts);
    renderMessages({ nodeId: node.id, stickToBottom: true });
  }

  if (type === 'content.snapshot' && event.contentId) {
    const contentId = String(event.contentId);
    const node = ensureContentTimelineNode(contentId, {
      text: event.text || '',
      status: 'completed',
      ts: event.timestamp || Date.now()
    });
    node.text = event.text || node.text || '';
    node.status = 'completed';
    node.ts = event.timestamp || node.ts;
    processViewportBlocks(contentId, node.text, event.runId || state.runId, node.ts);
    renderMessages({ nodeId: node.id, stickToBottom: true });
  }

  if (type === 'tool.start') {
    handleToolStart(event, source);
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

    const parsedFromArgs = tryParseJsonObject(current.argsBuffer);
    if (parsedFromArgs) {
      current.toolParams = parsedFromArgs;
    }
    state.toolStates.set(event.toolId, current);
    syncFrontendToolParamsByState(current);

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
      runId: event.runId || state.runId,
      toolName: event.toolName || event.toolId,
      toolType: event.toolType || '',
      toolKey: event.toolKey || '',
      toolTimeout: event.toolTimeout ?? null,
      toolApi: event.toolApi || '',
      description: event.description || ''
    };
    current.runId = event.runId || current.runId || state.runId;
    current.toolName = event.toolName || current.toolName || event.toolId;
    current.toolType = event.toolType || current.toolType;
    current.toolKey = event.toolKey || current.toolKey;
    current.toolTimeout = event.toolTimeout ?? current.toolTimeout;
    current.toolApi = event.toolApi || current.toolApi || '';
    current.description = event.description || current.description || '';
    current.toolParams = resolveToolParams(event, current.toolParams);
    state.toolStates.set(event.toolId, current);

    const argsText = current.toolParams
      ? toPrettyJson(current.toolParams, '{}')
      : toPrettyJson(current.argsBuffer, '{}');

    const node = ensureToolTimelineNode(event.toolId, {
      toolName: current.toolName,
      toolApi: current.toolApi,
      description: current.description,
      argsText,
      status: 'completed',
      ts: event.timestamp || Date.now()
    });
    node.argsText = argsText;
    node.status = 'completed';
    node.ts = event.timestamp || node.ts;
    renderMessages({ nodeId: node.id, stickToBottom: true });

    if (source !== 'history' && isFrontendToolEvent({
      toolType: current.toolType,
      toolKey: current.toolKey
    })) {
      upsertPendingFrontendTool(current, 'pending(snapshot)');
      activateFrontendTool(current);
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

  const loadSeq = state.chatLoadSeq + 1;
  state.chatLoadSeq = loadSeq;

  if (state.streaming) {
    stopStreaming();
  }

  state.chatId = chatId;
  state.runId = '';
  state.requestId = '';
  updateChatChip();
  renderChats();
  resetConversationState();

  setStatus(`loading chat ${chatId}...`);
  const response = await getChat(chatId, includeRawMessages);
  if (loadSeq !== state.chatLoadSeq) {
    return;
  }

  const events = Array.isArray(response.data?.events) ? response.data.events : [];
  for (const event of events) {
    if (loadSeq !== state.chatLoadSeq) {
      return;
    }

    if (event?.chatId && String(event.chatId) !== String(chatId)) {
      continue;
    }

    handleAgwEvent(event, 'history');
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
  state.chatLoadSeq += 1;

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
  clearActiveFrontendTool();
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

  if (state.activeFrontendTool) {
    setStatus('前端工具等待提交中，请先在确认面板中完成提交', 'error');
    return;
  }

  elements.messageInput.value = '';
  autosizeComposerInput();
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
        handleAgwEvent(jsonEvent, 'live');
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
    const params = JSON.parse(pending.payloadText || '{}');
    if (!pending.runId || !pending.toolId) {
      throw new Error('runId/toolId is missing, cannot submit');
    }

    const response = await submitTool({
      runId: pending.runId,
      toolId: pending.toolId,
      params
    });

    appendDebug({ type: 'submit.response', data: response.data });

    const accepted = Boolean(response.data?.accepted);
    const status = String(response.data?.status || (accepted ? 'accepted' : 'unmatched'));
    const detail = String(response.data?.detail || status);

    if (accepted) {
      state.pendingTools.delete(key);
      if (state.activeFrontendTool && state.activeFrontendTool.key === key) {
        clearActiveFrontendTool();
      }
      setStatus(`submit accepted: ${pending.toolId}`);
    } else {
      pending.status = 'error';
      pending.statusText = detail;
      state.pendingTools.set(key, pending);
      setStatus(`submit unmatched: ${pending.toolId}`, 'error');
    }

    renderPendingTools();
  } catch (error) {
    pending.status = 'error';
    pending.statusText = error.message;
    renderPendingTools();
    setStatus(`submit failed: ${error.message}`, 'error');
  }
}

async function submitActiveFrontendTool(rawParams) {
  const active = state.activeFrontendTool;
  if (!active) {
    setStatus('当前没有等待提交的前端工具', 'error');
    return;
  }

  const params = rawParams && typeof rawParams === 'object' ? rawParams : {};
  const key = active.key;
  const pending = state.pendingTools.get(key);
  if (pending) {
    pending.payloadText = toPendingParamsText(params);
    state.pendingTools.set(key, pending);
  }
  renderPendingTools();
  setFrontendToolStatus('提交中...', 'normal');

  try {
    const response = await submitTool({
      runId: active.runId,
      toolId: active.toolId,
      params
    });

    appendDebug({ type: 'frontend.submit.response', data: response.data });
    const accepted = Boolean(response.data?.accepted);
    const status = String(response.data?.status || (accepted ? 'accepted' : 'unmatched'));
    const detail = String(response.data?.detail || status);

    if (accepted) {
      if (pending) {
        pending.status = 'ok';
        pending.statusText = detail;
      }
      state.pendingTools.delete(key);
      renderPendingTools();
      setStatus(`submit accepted: ${active.toolId}`);
      clearActiveFrontendTool();
      return;
    }

    if (pending) {
      pending.status = 'error';
      pending.statusText = detail;
      state.pendingTools.set(key, pending);
    }
    renderPendingTools();
    setFrontendToolStatus(`提交未命中：${detail}`, 'error');
    setStatus(`submit unmatched: ${active.toolId}`, 'error');
  } catch (error) {
    if (pending) {
      pending.status = 'error';
      pending.statusText = error.message;
      state.pendingTools.set(key, pending);
    }
    renderPendingTools();
    setFrontendToolStatus(`提交失败：${error.message}`, 'error');
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

  elements.accessTokenApply.addEventListener('click', () => {
    applyAccessToken();
  });

  elements.accessTokenClear.addEventListener('click', () => {
    clearAccessToken();
  });

  elements.accessTokenInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    applyAccessToken();
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
    autosizeComposerInput();
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
    const textarea = event.target.closest('textarea[data-role="pending-params"]');
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

    if (data.type === 'frontend_submit') {
      const active = state.activeFrontendTool;
      if (!active) {
        return;
      }

      if (elements.frontendToolFrame.contentWindow && event.source !== elements.frontendToolFrame.contentWindow) {
        return;
      }

      const params = data.params && typeof data.params === 'object' ? data.params : {};
      submitActiveFrontendTool(params).catch((error) => {
        setFrontendToolStatus(`提交失败：${error.message}`, 'error');
        setStatus(`submit failed: ${error.message}`, 'error');
      });
      return;
    }

    if (data.type !== 'chat_message') {
      return;
    }

    if (state.activeFrontendTool) {
      setStatus('前端工具等待提交中，请先完成当前确认', 'error');
      return;
    }

    const message = typeof data.message === 'string' ? data.message.trim() : '';
    if (!message) {
      return;
    }

    elements.messageInput.value = message;
    autosizeComposerInput();
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
    autosizeComposerInput();
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
  renderActiveFrontendTool();
  renderDebugTabs();
  renderMentionSuggestions();
  autosizeComposerInput();
  setViewportExpanded(false);
  setSettingsOpen(false);
  syncDrawerState();
  setAccessToken('');

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
