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

  function renderPendingTools() {
    if (state.pendingTools.size === 0) {
      elements.pendingTools.innerHTML = '<div class="status-line">暂无 pending frontend tool</div>';
      return;
    }

    const html = [...state.pendingTools.values()]
      .map((tool) => {
        return `
          <article class="pending-card">
            <div><strong>${ctx.ui.escapeHtml(tool.toolName || tool.toolId)}</strong></div>
            <div class="mono">runId=${ctx.ui.escapeHtml(tool.runId)}<br/>toolId=${ctx.ui.escapeHtml(tool.toolId)}</div>
            <div>toolApi: ${ctx.ui.escapeHtml(tool.toolApi || '-')}</div>
            <div>toolType/key: ${ctx.ui.escapeHtml(tool.toolType || '-')} / ${ctx.ui.escapeHtml(tool.toolKey || '-')}</div>
            <div>${ctx.ui.escapeHtml(tool.description || '')}</div>
            <div class="mono">params</div>
            <textarea data-role="pending-params" data-key="${ctx.ui.escapeHtml(tool.key)}">${ctx.ui.escapeHtml(tool.payloadText)}</textarea>
            <button data-action="submit-pending" data-key="${ctx.ui.escapeHtml(tool.key)}" type="button">Submit params /api/ap/submit</button>
            <div class="pending-status ${tool.status === 'error' ? 'err' : tool.status === 'ok' ? 'ok' : ''}">${ctx.ui.escapeHtml(tool.statusText || 'pending')}</div>
          </article>
        `;
      })
      .join('');

    elements.pendingTools.innerHTML = html;
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
