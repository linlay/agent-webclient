import { MAX_EVENTS } from '../context/constants.js';

export function createAgentEventHandler(ctx) {
  const { state, actions, ui } = ctx;

  function applyAction(actionId, actionName, args) {
    if (!actionId || state.executedActionIds.has(actionId)) {
      return;
    }
    state.executedActionIds.add(actionId);
    ctx.services.actionRuntime.execute(actionName, args);
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
      state.activeReasoningKey = `implicit:${ui.nextTimelineNodeId('reasoning')}`;
    }

    return state.activeReasoningKey;
  }

  function handleReasoningEvent(event, type, source = 'live') {
    const key = resolveReasoningKey(event, type);
    const node = ui.ensureReasoningNode(key, event.timestamp || Date.now());
    const isHistory = source === 'history';

    if (type === 'reasoning.start') {
      ui.clearReasoningCollapseTimer(key);
      if (event.text) {
        node.text = event.text;
      }
      node.status = 'running';
      node.expanded = true;
    }

    if (type === 'reasoning.delta') {
      ui.clearReasoningCollapseTimer(key);
      node.text = `${node.text || ''}${event.delta || ''}`;
      node.status = 'running';
      node.expanded = true;
    }

    if (type === 'reasoning.snapshot') {
      node.text = event.text || node.text || '';
      node.status = 'completed';
      state.activeReasoningKey = '';
      if (isHistory) {
        ui.clearReasoningCollapseTimer(key);
        node.expanded = false;
      } else {
        node.expanded = true;
        ui.scheduleReasoningAutoCollapse(key, node.id);
      }
    }

    if (type === 'reasoning.end') {
      if (event.text) {
        node.text = event.text;
      }
      node.status = 'completed';
      state.activeReasoningKey = '';
      if (isHistory) {
        ui.clearReasoningCollapseTimer(key);
        node.expanded = false;
      } else {
        node.expanded = true;
        ui.scheduleReasoningAutoCollapse(key, node.id);
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
    const resolvedParams = ui.resolveToolParams(event, toolState.toolParams);

    toolState.toolName = event.toolName || toolState.toolName;
    toolState.toolType = event.toolType || toolState.toolType;
    toolState.toolKey = event.toolKey || toolState.toolKey;
    toolState.toolTimeout = event.toolTimeout ?? toolState.toolTimeout;
    toolState.toolApi = event.toolApi || toolState.toolApi;
    toolState.toolParams = resolvedParams;
    toolState.description = event.description || toolState.description;
    toolState.runId = event.runId || toolState.runId;

    state.toolStates.set(toolId, toolState);

    const node = ui.ensureToolTimelineNode(toolId, {
      toolName: toolState.toolName || toolId,
      toolApi: toolState.toolApi || '',
      description: toolState.description || '',
      argsText: toolState.toolParams ? ui.toPrettyJson(toolState.toolParams, '{}') : '{}',
      status: 'running',
      ts: event.timestamp || Date.now()
    });
    node.expanded = false;

    if (source !== 'history' && ui.isFrontendToolEvent({
      toolType: toolState.toolType,
      toolKey: toolState.toolKey
    })) {
      ui.upsertPendingFrontendTool(toolState, 'pending');
      ui.activateFrontendTool(toolState);
    }
  }

  function handleAgentEvent(event, source = 'live') {
    if (!event || typeof event !== 'object') {
      return;
    }

    state.events.push(event);
    if (state.events.length > MAX_EVENTS) {
      state.events.shift();
    }

    ui.appendDebug(event);

    const type = event.type || 'unknown';

    if (event.chatId) {
      state.chatId = event.chatId;
      ui.updateChatChip();
      ui.renderChats();
    }

    if (type === 'request.query') {
      state.requestId = event.requestId || state.requestId;
      const id = `user:${event.requestId || state.events.length}`;
      ui.upsertMessage(id, 'user', event.message || '', event.timestamp || Date.now());
      const nodeId = state.timelineNodeByMessageId.get(id);
      ui.renderMessages({ nodeId, stickToBottom: true });
    }

    if (type === 'run.start') {
      state.runId = event.runId || state.runId;
      ui.setStatus(`run.start ${state.runId}`);
    }

    if (type === 'run.complete') {
      state.runId = event.runId || state.runId;
      ui.setStatus(`run.complete (${event.finishReason || 'end_turn'})`);
      state.streaming = false;
      ui.clearActiveFrontendTool();
      actions.refreshChats().catch((error) => ui.appendDebug(`refresh chats failed: ${error.message}`));
    }

    if (type === 'run.error') {
      state.streaming = false;
      ui.clearActiveFrontendTool();
      const id = `sys:error:${Date.now()}`;
      ui.upsertMessage(id, 'system', `run.error: ${JSON.stringify(event.error || {}, null, 2)}`, Date.now());
      const nodeId = state.timelineNodeByMessageId.get(id);
      ui.renderMessages({ nodeId, stickToBottom: true });
      ui.setStatus('run.error', 'error');
    }

    if (type === 'run.cancel') {
      state.streaming = false;
      ui.clearActiveFrontendTool();
      const id = `sys:cancel:${Date.now()}`;
      ui.upsertMessage(id, 'system', 'run.cancel', Date.now());
      const nodeId = state.timelineNodeByMessageId.get(id);
      ui.renderMessages({ nodeId, stickToBottom: true });
      ui.setStatus('run.cancel', 'error');
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
      ui.syncPlanRuntime(state.plan.plan);

      if (state.planManualOverride === true) {
        state.planExpanded = true;
        ui.clearPlanAutoCollapseTimer();
      } else if (state.planManualOverride === false) {
        state.planExpanded = false;
        ui.clearPlanAutoCollapseTimer();
      } else {
        state.planExpanded = true;
        ui.schedulePlanAutoCollapse();
      }

      ui.renderPlan();
    }

    if (type === 'task.start' || type === 'task.complete' || type === 'task.cancel' || type === 'task.fail') {
      if (ui.applyTaskLifecycleEvent(event)) {
        ui.renderPlan();
      }
    }

    if (type === 'reasoning.start' || type === 'reasoning.delta' || type === 'reasoning.end' || type === 'reasoning.snapshot') {
      const node = handleReasoningEvent(event, type, source);
      ui.renderMessages({ nodeId: node?.id, stickToBottom: true });
    }

    if (type === 'content.start' && event.contentId) {
      const contentId = String(event.contentId);
      const node = ui.ensureContentTimelineNode(contentId, {
        text: typeof event.text === 'string' ? event.text : '',
        status: 'running',
        ts: event.timestamp || Date.now()
      });
      node.text = typeof event.text === 'string' ? event.text : '';
      node.status = 'running';
      node.ts = event.timestamp || node.ts;
      ui.processViewportBlocks(contentId, node.text, event.runId || state.runId, node.ts);
      ui.renderMessages({ nodeId: node.id, stickToBottom: true });
    }

    if (type === 'content.delta' && event.contentId) {
      const contentId = String(event.contentId);
      const node = ui.ensureContentTimelineNode(contentId, {
        status: 'running',
        ts: event.timestamp || Date.now()
      });
      node.text = `${node.text || ''}${event.delta || ''}`;
      node.status = 'running';
      node.ts = event.timestamp || node.ts;
      ui.processViewportBlocks(contentId, node.text, event.runId || state.runId, node.ts);
      ui.renderMessages({ nodeId: node.id, stickToBottom: true });
    }

    if (type === 'content.end' && event.contentId) {
      const contentId = String(event.contentId);
      const node = ui.ensureContentTimelineNode(contentId, {
        status: 'completed',
        ts: event.timestamp || Date.now()
      });
      if (typeof event.text === 'string' && event.text.trim()) {
        node.text = event.text;
      }
      node.status = 'completed';
      node.ts = event.timestamp || node.ts;
      ui.processViewportBlocks(contentId, node.text, event.runId || state.runId, node.ts);
      ui.renderMessages({ nodeId: node.id, stickToBottom: true });
    }

    if (type === 'content.snapshot' && event.contentId) {
      const contentId = String(event.contentId);
      const node = ui.ensureContentTimelineNode(contentId, {
        text: event.text || '',
        status: 'completed',
        ts: event.timestamp || Date.now()
      });
      node.text = event.text || node.text || '';
      node.status = 'completed';
      node.ts = event.timestamp || node.ts;
      ui.processViewportBlocks(contentId, node.text, event.runId || state.runId, node.ts);
      ui.renderMessages({ nodeId: node.id, stickToBottom: true });
    }

    if (type === 'tool.start') {
      handleToolStart(event, source);
      const nodeId = state.toolNodeById.get(event.toolId);
      ui.renderMessages({ nodeId, stickToBottom: true });
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

      const parsedFromArgs = ui.tryParseJsonObject(current.argsBuffer);
      if (parsedFromArgs) {
        current.toolParams = parsedFromArgs;
      }
      state.toolStates.set(event.toolId, current);
      ui.syncFrontendToolParamsByState(current);

      const node = ui.ensureToolTimelineNode(event.toolId, {
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
      ui.renderMessages({ nodeId: node.id, stickToBottom: true });
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
      current.toolParams = ui.resolveToolParams(event, current.toolParams);
      state.toolStates.set(event.toolId, current);

      const argsText = current.toolParams
        ? ui.toPrettyJson(current.toolParams, '{}')
        : ui.toPrettyJson(current.argsBuffer, '{}');

      const node = ui.ensureToolTimelineNode(event.toolId, {
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
      ui.renderMessages({ nodeId: node.id, stickToBottom: true });

      if (source !== 'history' && ui.isFrontendToolEvent({
        toolType: current.toolType,
        toolKey: current.toolKey
      })) {
        ui.upsertPendingFrontendTool(current, 'pending(snapshot)');
        ui.activateFrontendTool(current);
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

      const resultPayload = ui.toToolResultPayload(resultValue);
      const node = ui.ensureToolTimelineNode(event.toolId, {
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
      ui.renderMessages({ nodeId: node.id, stickToBottom: true });
    }

    if (type === 'tool.end' && event.toolId) {
      const node = ui.ensureToolTimelineNode(event.toolId, {
        status: 'completed',
        ts: event.timestamp || Date.now()
      });
      if (!node.result) {
        node.status = event.error ? 'failed' : 'completed';
      }
      node.ts = event.timestamp || node.ts;
      ui.renderMessages({ nodeId: node.id, stickToBottom: true });
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
        const parsed = ctx.services.safeJsonParse(action.argsBuffer, {});
        applyAction(event.actionId, action.actionName || 'unknown', parsed);
      }
    }

    if (type === 'action.snapshot' && event.actionId) {
      const parsed = ctx.services.safeJsonParse(event.arguments || '', {});
      applyAction(event.actionId, event.actionName || 'unknown', parsed);
    }

    ui.renderEvents();
  }

  return {
    handleAgentEvent,
    handleToolStart,
    handleReasoningEvent
  };
}
