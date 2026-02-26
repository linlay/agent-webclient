import { FRONTEND_VIEWPORT_TYPES } from '../context/constants.js';

export function createFrontendToolRuntime(ctx) {
  const { state, elements, services } = ctx;

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

  function resolveToolParams(event, fallbackParams = null) {
    const parsed = services.parseFrontendToolParams(event);
    if (parsed.error) {
      ctx.ui.appendDebug(parsed.error);
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
        ctx.ui.appendDebug(`frontend tool init postMessage failed: ${error.message}`);
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
      ctx.ui.closeMentionSuggestions();
      elements.composerPill.blur();
    }

    ctx.ui.autosizeComposerInput();
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
      ctx.ui.setStatus(active.loadError, 'error');
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
          ctx.ui.appendDebug(`frontend tool init postMessage failed: ${error.message}`);
        }
      };
      elements.frontendToolFrame.srcdoc = active.viewportHtml;
    } else if (active.viewportHtml) {
      try {
        postInitMessageToFrontendToolFrame();
      } catch (error) {
        ctx.ui.appendDebug(`frontend tool init postMessage failed: ${error.message}`);
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
      const response = await services.getViewport(active.toolKey);
      if (!state.activeFrontendTool || state.activeFrontendTool.key !== expectedKey) {
        return;
      }

      const payload = response.data;
      const html = typeof payload?.html === 'string'
        ? payload.html
        : `<html><body><pre>${ctx.ui.escapeHtml(JSON.stringify(payload ?? {}, null, 2))}</pre></body></html>`;

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
        ctx.ui.appendDebug(`frontend viewport load failed: ${error.message}`);
      });
    } else {
      try {
        postInitMessageToFrontendToolFrame();
      } catch (error) {
        ctx.ui.appendDebug(`frontend tool init postMessage failed: ${error.message}`);
      }
    }
  }

  function toEntityKey(prefix, runId, entityId) {
    const rid = String(runId || '').trim();
    const eid = String(entityId || '').trim();
    if (!eid) {
      return '';
    }
    return rid ? `${prefix}:${rid}#${eid}` : `${prefix}:${eid}`;
  }

  function toPrettyJson(value, fallback = '{}') {
    if (value === undefined || value === null) {
      return fallback;
    }

    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) {
        return fallback;
      }
      try {
        return JSON.stringify(JSON.parse(text), null, 2);
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

  function aggregateToolAndActionRows() {
    const toolRows = new Map();
    const actionRows = new Map();

    state.events.forEach((event, index) => {
      const type = String(event?.type || '');
      const eventTs = Number(event?.timestamp) || 0;

      if (type.startsWith('tool.')) {
        const toolId = String(event?.toolId || '').trim();
        if (!toolId) {
          return;
        }

        const rowKey = toEntityKey('tool', event.runId, toolId);
        if (!rowKey) {
          return;
        }

        const row = toolRows.get(rowKey) || {
          key: rowKey,
          kind: 'tool',
          index,
          updatedAt: eventTs,
          runId: String(event.runId || '').trim(),
          toolId,
          toolName: String(event.toolName || toolId),
          toolApi: String(event.toolApi || ''),
          toolType: normalizeFrontendToolType(event.toolType),
          toolKey: String(event.toolKey || ''),
          description: String(event.description || ''),
          status: 'pending',
          lastEventType: type,
          argsBuffer: '',
          toolParams: null,
          result: null,
          error: null
        };

        row.updatedAt = eventTs || row.updatedAt;
        row.runId = String(event.runId || row.runId || '').trim();
        row.toolName = String(event.toolName || row.toolName || toolId);
        row.toolApi = String(event.toolApi || row.toolApi || '');
        row.toolType = normalizeFrontendToolType(event.toolType || row.toolType);
        row.toolKey = String(event.toolKey || row.toolKey || '');
        row.description = String(event.description || row.description || '');
        row.lastEventType = type;

        if (type === 'tool.start') {
          row.status = 'running';
          row.toolParams = resolveToolParams(event, row.toolParams);
        }

        if (type === 'tool.args') {
          row.status = 'running';
          row.argsBuffer += event.delta || '';
          const parsed = tryParseJsonObject(row.argsBuffer);
          if (parsed) {
            row.toolParams = parsed;
          }
        }

        if (type === 'tool.snapshot') {
          row.toolParams = resolveToolParams(event, row.toolParams);
          row.status = 'completed';
        }

        if (type === 'tool.result') {
          const resultValue = Object.prototype.hasOwnProperty.call(event, 'result')
            ? event.result
            : (event.output ?? event.text ?? '');
          row.result = resultValue;
          row.error = event.error ?? row.error;
          row.status = event.error ? 'failed' : 'completed';
        }

        if (type === 'tool.end') {
          if (event.error) {
            row.error = event.error;
            row.status = 'failed';
          } else if (row.status !== 'failed') {
            row.status = 'completed';
          }
        }

        toolRows.set(rowKey, row);
        return;
      }

      if (!type.startsWith('action.')) {
        return;
      }

      const actionId = String(event?.actionId || '').trim();
      if (!actionId) {
        return;
      }

      const rowKey = toEntityKey('action', event.runId, actionId);
      if (!rowKey) {
        return;
      }

      const row = actionRows.get(rowKey) || {
        key: rowKey,
        kind: 'action',
        index,
        updatedAt: eventTs,
        runId: String(event.runId || '').trim(),
        actionId,
        actionName: String(event.actionName || 'unknown'),
        status: 'pending',
        lastEventType: type,
        argsBuffer: '',
        args: null,
        error: null
      };

      row.updatedAt = eventTs || row.updatedAt;
      row.runId = String(event.runId || row.runId || '').trim();
      row.actionName = String(event.actionName || row.actionName || 'unknown');
      row.lastEventType = type;

      if (type === 'action.start') {
        row.status = 'running';
      }

      if (type === 'action.args') {
        row.status = 'running';
        row.argsBuffer += event.delta || '';
        const parsed = tryParseJsonObject(row.argsBuffer);
        if (parsed) {
          row.args = parsed;
        }
      }

      if (type === 'action.snapshot') {
        row.args = typeof event.arguments === 'string'
          ? (tryParseJsonObject(event.arguments) || event.arguments)
          : (event.arguments ?? row.args);
        row.status = 'completed';
      }

      if (type === 'action.end') {
        if (event.error) {
          row.error = event.error;
          row.status = 'failed';
        } else if (row.status !== 'failed') {
          row.status = 'completed';
        }
      }

      actionRows.set(rowKey, row);
    });

    return [...toolRows.values(), ...actionRows.values()]
      .sort((a, b) => {
        if (a.updatedAt && b.updatedAt && a.updatedAt !== b.updatedAt) {
          return a.updatedAt - b.updatedAt;
        }
        return a.index - b.index;
      });
  }

  function renderPendingTools() {
    const rows = aggregateToolAndActionRows();

    if (rows.length === 0) {
      elements.pendingTools.innerHTML = '<div class="status-line">暂无 tool/action 事件</div>';
      return;
    }

    const html = rows
      .map((row) => {
        const ts = row.updatedAt ? new Date(row.updatedAt).toLocaleTimeString() : '--';
        const ids = row.kind === 'tool'
          ? `runId=${row.runId || '-'} toolId=${row.toolId}`
          : `runId=${row.runId || '-'} actionId=${row.actionId}`;

        const payload = row.kind === 'tool'
          ? {
            kind: 'tool',
            runId: row.runId || null,
            toolId: row.toolId,
            toolName: row.toolName,
            status: row.status,
            lastEventType: row.lastEventType,
            toolApi: row.toolApi || null,
            toolType: row.toolType || null,
            toolKey: row.toolKey || null,
            description: row.description || null,
            args: row.toolParams ?? (row.argsBuffer || {}),
            result: row.result,
            error: row.error
          }
          : {
            kind: 'action',
            runId: row.runId || null,
            actionId: row.actionId,
            actionName: row.actionName,
            status: row.status,
            lastEventType: row.lastEventType,
            args: row.args ?? (row.argsBuffer || {}),
            executed: state.executedActionIds.has(row.actionId),
            error: row.error
          };

        const prettyPayload = toPrettyJson(payload);
        const title = row.kind === 'tool'
          ? `tool: ${row.toolName || row.toolId}`
          : `action: ${row.actionName || row.actionId}`;

        return `
          <article class="debug-event-card">
            <div class="debug-event-head">
              <strong>${ctx.ui.escapeHtml(title)}</strong>
              <span class="event-row-time">${ctx.ui.escapeHtml(ts)}</span>
            </div>
            <div class="mono debug-event-meta">${ctx.ui.escapeHtml(ids)} | status=${ctx.ui.escapeHtml(row.status)}</div>
            <pre class="debug-event-json">${ctx.ui.escapeHtml(prettyPayload)}</pre>
          </article>
        `;
      })
      .join('');

    elements.pendingTools.innerHTML = html;
    elements.pendingTools.scrollTop = elements.pendingTools.scrollHeight;
  }

  return {
    isFrontendToolEvent,
    frontendPendingKey,
    toPendingParamsText,
    tryParseJsonObject,
    resolveToolParams,
    syncFrontendToolParamsByState,
    renderActiveFrontendTool,
    clearActiveFrontendTool,
    upsertPendingFrontendTool,
    activateFrontendTool,
    renderPendingTools,
    setFrontendToolStatus
  };
}
