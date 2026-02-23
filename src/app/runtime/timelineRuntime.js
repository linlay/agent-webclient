import { REASONING_AUTO_COLLAPSE_MS, COMPOSER_MAX_LINES, COMPOSER_MIN_LINES } from '../context/constants.js';
import { stripViewportBlocksFromText } from '../../lib/contentSegments.js';

const markdownImageBlobUrlCache = new Map();

export function createTimelineRuntime(ctx) {
  const { state, elements, services } = ctx;
  const { renderMarkdown, safeJsonParse } = services;

  function escapeHtml(input) {
    return String(input ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function shouldFetchMarkdownImageWithAuth(src) {
    if (!src) {
      return false;
    }
    try {
      const url = new URL(src, window.location.origin);
      return url.origin === window.location.origin && url.pathname === '/api/ap/data';
    } catch (_error) {
      return false;
    }
  }

  async function hydrateMarkdownImagesWithAuth(container) {
    if (!container) {
      return;
    }

    const images = Array.from(container.querySelectorAll('img'));
    await Promise.all(images.map(async (img) => {
      const rawSrc = img.getAttribute('data-auth-src') || img.getAttribute('src') || '';
      if (!shouldFetchMarkdownImageWithAuth(rawSrc)) {
        return;
      }

      const normalizedUrl = new URL(rawSrc, window.location.origin).toString();
      const token = String(state.accessToken || '').trim();
      const cacheKey = `${token}::${normalizedUrl}`;
      let blobUrlPromise = markdownImageBlobUrlCache.get(cacheKey);

      if (!blobUrlPromise) {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        blobUrlPromise = fetch(normalizedUrl, { headers })
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            const blob = await response.blob();
            return URL.createObjectURL(blob);
          });
        markdownImageBlobUrlCache.set(cacheKey, blobUrlPromise);
      }

      try {
        const blobUrl = await blobUrlPromise;
        if (!img.isConnected) {
          return;
        }
        img.setAttribute('src', blobUrl);
        img.removeAttribute('data-auth-src');
      } catch (error) {
        ctx.ui.appendDebug(`markdown image auth load failed: ${normalizedUrl} ${error.message}`);
      }
    }));
  }

  function renderMarkdownIntoNode(node, markdownText) {
    node.innerHTML = renderMarkdown(markdownText);
    hydrateMarkdownImagesWithAuth(node).catch((error) => {
      ctx.ui.appendDebug(`hydrate markdown images failed: ${error.message}`);
    });
  }

  function appendMarkdownBlock(container, markdownText) {
    const node = document.createElement('div');
    node.className = 'timeline-text timeline-markdown';
    renderMarkdownIntoNode(node, markdownText);
    container.append(node);
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
        appendMarkdownBlock(container, fallbackText);
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

        appendMarkdownBlock(container, text);
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
          ctx.ui.appendDebug(`content viewport postMessage failed: ${error.message}`);
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
          <div class="timeline-text timeline-markdown"></div>
        </div>
      `;
      const markdownNode = row.querySelector('.timeline-markdown');
      if (markdownNode) {
        renderMarkdownIntoNode(markdownNode, visibleText);
      }
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

  function renderMessages(options = {}) {
    const { stickToBottom = true, full = false, nodeId = '' } = options;
    scheduleRender({ nodeId, stickToBottom, full });
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

  return {
    escapeHtml,
    autosizeComposerInput,
    renderMessages,
    upsertMessage,
    appendMessageText,
    getMessage,
    nextTimelineNodeId,
    ensureReasoningNode,
    ensureToolTimelineNode,
    ensureContentTimelineNode,
    toPrettyJson,
    toToolResultPayload,
    clearReasoningCollapseTimer,
    clearAllReasoningCollapseTimers,
    scheduleReasoningAutoCollapse
  };
}
