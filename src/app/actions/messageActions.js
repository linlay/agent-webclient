export function createMessageActions(ctx) {
  const { state, elements, services } = ctx;

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
    if (!rawMessage.trim()) {
      ctx.ui.setStatus('消息为空，无法发送', 'error');
      return;
    }

    if (!String(state.accessToken || '').trim()) {
      ctx.ui.setStatus('Access Token 缺失，请先输入后再发送消息', 'error');
      ctx.ui.promptAccessToken('Access Token 不能为空，请先输入后再发送消息');
      return;
    }

    const mention = services.parseLeadingAgentMention(rawMessage, state.agents);

    if (mention.error) {
      ctx.ui.setStatus(`mention error: ${mention.error}`, 'error');
      return;
    }

    const message = mention.cleanMessage.trim();
    if (!message) {
      ctx.ui.setStatus('消息为空，无法发送', 'error');
      return;
    }

    if (state.streaming) {
      ctx.ui.setStatus('streaming in progress, stop first', 'error');
      return;
    }

    if (state.activeFrontendTool) {
      ctx.ui.setStatus('前端工具等待提交中，请先在确认面板中完成提交', 'error');
      return;
    }

    elements.messageInput.value = '';
    ctx.ui.autosizeComposerInput();
    ctx.ui.closeMentionSuggestions();

    ctx.actions.resetRunTransientState();
    const controller = new AbortController();
    state.abortController = controller;
    state.streaming = true;

    const rememberedChatAgentKey = state.chatId ? String(state.chatAgentById.get(state.chatId) || '').trim() : '';
    const requestAgentKey = mention.mentionAgentKey || rememberedChatAgentKey || undefined;

    if (mention.mentionAgentKey) {
      if (state.chatId) {
        state.chatAgentById.set(state.chatId, mention.mentionAgentKey);
      } else {
        state.pendingNewChatAgentKey = mention.mentionAgentKey;
      }
    }

    if (mention.mentionAgentKey) {
      ctx.ui.setStatus(`query streaming via @${mention.mentionAgentKey}...`);
    } else if (rememberedChatAgentKey) {
      ctx.ui.setStatus(`query streaming via chat @${rememberedChatAgentKey}...`);
    } else {
      ctx.ui.setStatus('query streaming...');
    }

    try {
      const response = await services.createQueryStream({
        message,
        agentKey: requestAgentKey,
        chatId: state.chatId || undefined,
        signal: controller.signal
      });

      if (!response.ok) {
        const bodyText = await response.text();
        throw new services.ApiError(parseQueryError(response.status, bodyText), { status: response.status });
      }

      await services.consumeJsonSseStream(response, {
        signal: controller.signal,
        onComment: (comments) => {
          if (comments.some((item) => String(item).includes('heartbeat'))) {
            return;
          }
          ctx.ui.appendDebug(`sse-comment: ${comments.join('|')}`);
        },
        onJson: (jsonEvent) => {
          ctx.handlers.handleAgentEvent(jsonEvent, 'live');
        },
        onParseError: (_error, rawData) => {
          ctx.ui.appendDebug(`sse-json-parse-failed: ${rawData}`);
        }
      });

      ctx.ui.setStatus('stream ended');
    } catch (error) {
      if (controller.signal.aborted) {
        ctx.ui.setStatus('stream aborted');
      } else {
        const id = `sys:error:${Date.now()}`;
        ctx.ui.upsertMessage(id, 'system', `query failed: ${error.message}`, Date.now());
        const nodeId = state.timelineNodeByMessageId.get(id);
        ctx.ui.renderMessages({ nodeId, stickToBottom: true });
        ctx.ui.setStatus(`query failed: ${error.message}`, 'error');
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

      const response = await services.submitTool({
        runId: pending.runId,
        toolId: pending.toolId,
        params
      });

      ctx.ui.appendDebug({ type: 'submit.response', data: response.data });

      const accepted = Boolean(response.data?.accepted);
      const status = String(response.data?.status || (accepted ? 'accepted' : 'unmatched'));
      const detail = String(response.data?.detail || status);

      if (accepted) {
        state.pendingTools.delete(key);
        if (state.activeFrontendTool && state.activeFrontendTool.key === key) {
          ctx.ui.clearActiveFrontendTool();
        }
        ctx.ui.setStatus(`submit accepted: ${pending.toolId}`);
      } else {
        pending.status = 'error';
        pending.statusText = detail;
        state.pendingTools.set(key, pending);
        ctx.ui.setStatus(`submit unmatched: ${pending.toolId}`, 'error');
      }

      ctx.ui.renderPendingTools();
    } catch (error) {
      pending.status = 'error';
      pending.statusText = error.message;
      ctx.ui.renderPendingTools();
      ctx.ui.setStatus(`submit failed: ${error.message}`, 'error');
    }
  }

  async function submitActiveFrontendTool(rawParams) {
    const active = state.activeFrontendTool;
    if (!active) {
      ctx.ui.setStatus('当前没有等待提交的前端工具', 'error');
      return;
    }

    const params = rawParams && typeof rawParams === 'object' ? rawParams : {};
    const key = active.key;
    const pending = state.pendingTools.get(key);
    if (pending) {
      pending.payloadText = ctx.ui.toPendingParamsText(params);
      state.pendingTools.set(key, pending);
    }
    ctx.ui.renderPendingTools();
    ctx.ui.setFrontendToolStatus('提交中...', 'normal');

    try {
      const response = await services.submitTool({
        runId: active.runId,
        toolId: active.toolId,
        params
      });

      ctx.ui.appendDebug({ type: 'frontend.submit.response', data: response.data });
      const accepted = Boolean(response.data?.accepted);
      const status = String(response.data?.status || (accepted ? 'accepted' : 'unmatched'));
      const detail = String(response.data?.detail || status);

      if (accepted) {
        if (pending) {
          pending.status = 'ok';
          pending.statusText = detail;
        }
        state.pendingTools.delete(key);
        ctx.ui.renderPendingTools();
        ctx.ui.setStatus(`submit accepted: ${active.toolId}`);
        ctx.ui.clearActiveFrontendTool();
        return;
      }

      if (pending) {
        pending.status = 'error';
        pending.statusText = detail;
        state.pendingTools.set(key, pending);
      }
      ctx.ui.renderPendingTools();
      ctx.ui.setFrontendToolStatus(`提交未命中：${detail}`, 'error');
      ctx.ui.setStatus(`submit unmatched: ${active.toolId}`, 'error');
    } catch (error) {
      if (pending) {
        pending.status = 'error';
        pending.statusText = error.message;
        state.pendingTools.set(key, pending);
      }
      ctx.ui.renderPendingTools();
      ctx.ui.setFrontendToolStatus(`提交失败：${error.message}`, 'error');
      ctx.ui.setStatus(`submit failed: ${error.message}`, 'error');
    }
  }

  async function applyAccessToken() {
    const normalized = ctx.ui.normalizeRawAccessToken(elements.accessTokenInput.value);
    if (!normalized.ok) {
      ctx.ui.setStatus(normalized.error, 'error');
      ctx.ui.promptAccessToken(normalized.error);
      return;
    }

    state.accessToken = normalized.token;
    elements.accessTokenInput.value = normalized.token;
    services.setAccessToken(normalized.token);
    ctx.ui.clearAccessTokenError();

    ctx.ui.setStatus('Access Token 已应用，正在刷新 agents/chats...');
    try {
      await Promise.all([ctx.actions.refreshAgents(), ctx.actions.refreshChats()]);
      ctx.ui.setStatus('Access Token 已应用');
      ctx.ui.setSettingsOpen(false);
    } catch (error) {
      ctx.ui.setStatus(`Access Token 已应用，但刷新失败: ${error.message}`, 'error');
    }
  }

  async function clearAccessToken() {
    state.accessToken = '';
    elements.accessTokenInput.value = '';
    services.setAccessToken('');
    state.agents = [];
    state.chats = [];
    ctx.actions.startNewChat();
    ctx.ui.renderChats();
    ctx.ui.renderAgents();
    ctx.ui.setStatus('Access Token 已清空，请重新输入', 'error');
    ctx.ui.promptAccessToken('Access Token 已清空，请重新输入');
  }

  return {
    sendMessage,
    submitPendingTool,
    submitActiveFrontendTool,
    applyAccessToken,
    clearAccessToken
  };
}
