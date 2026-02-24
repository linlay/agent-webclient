export function createChatActions(ctx) {
  const { state, elements, services } = ctx;

  function resetConversationState() {
    ctx.ui.clearAllReasoningCollapseTimers();
    state.messagesById.clear();
    state.messageOrder = [];
    state.events = [];
    state.plan = null;
    state.planRuntimeByTaskId.clear();
    state.planCurrentRunningTaskId = '';
    state.planLastTouchedTaskId = '';
    state.planExpanded = false;
    state.planManualOverride = null;
    ctx.ui.clearPlanAutoCollapseTimer();
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
    ctx.ui.clearActiveFrontendTool();
    elements.viewportList.innerHTML = '';
    ctx.ui.renderMessages({ full: true, stickToBottom: false });
    ctx.ui.renderEvents();
    ctx.ui.renderPlan();
    ctx.ui.renderPendingTools();
  }

  function resetRunTransientState() {
    ctx.ui.clearAllReasoningCollapseTimers();
    state.toolStates.clear();
    state.toolNodeById.clear();
    state.contentNodeById.clear();
    state.reasoningNodeById.clear();
    state.reasoningCollapseTimers.clear();
    state.activeReasoningKey = '';
    state.pendingTools.clear();
    state.actionStates.clear();
    state.executedActionIds.clear();
    ctx.ui.clearActiveFrontendTool();
    ctx.ui.renderPendingTools();
  }

  async function refreshAgents() {
    const response = await services.getAgents();
    state.agents = Array.isArray(response.data) ? response.data : [];
    ctx.ui.renderAgents();
    ctx.ui.updateMentionSuggestions();
    ctx.ui.setStatus(`agents loaded: ${state.agents.length}`);
  }

  async function refreshChats() {
    const response = await services.getChats();
    state.chats = Array.isArray(response.data) ? response.data : [];
    ctx.ui.renderChats();
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
    ctx.ui.updateChatChip();
    ctx.ui.renderChats();
    resetConversationState();

    ctx.ui.setStatus(`loading chat ${chatId}...`);
    const response = await services.getChat(chatId, includeRawMessages);
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

      ctx.handlers.handleAgentEvent(event, 'history');
    }

    const rawMessages = response.data?.rawMessages || response.data?.messages;
    if (includeRawMessages && Array.isArray(rawMessages)) {
      ctx.ui.appendDebug({ type: 'rawMessages', count: rawMessages.length });
    }

    ctx.ui.renderChats();
    ctx.ui.closeDrawers();
    ctx.ui.setStatus(`chat loaded: ${chatId}`);
  }

  function startNewChat() {
    state.chatLoadSeq += 1;

    if (state.streaming) {
      stopStreaming();
    }

    state.chatId = '';
    state.runId = '';
    state.requestId = '';
    ctx.ui.updateChatChip();
    resetConversationState();
    ctx.ui.renderChats();
    ctx.ui.closeDrawers();
    ctx.ui.setStatus('new chat ready');
  }

  function stopStreaming() {
    if (state.abortController) {
      state.abortController.abort();
      state.abortController = null;
    }
    state.streaming = false;
    ctx.ui.clearActiveFrontendTool();
    ctx.ui.setStatus('stream stopped');
  }

  return {
    resetConversationState,
    resetRunTransientState,
    refreshAgents,
    refreshChats,
    loadChat,
    startNewChat,
    stopStreaming
  };
}
