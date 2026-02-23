import {
  ApiError,
  createQueryStream,
  getAgents,
  getChat,
  getChats,
  getViewport,
  setAccessToken,
  submitTool
} from '../lib/apiClient.js';
import { createActionRuntime, safeJsonParse } from '../lib/actionRuntime.js';
import { parseContentSegments } from '../lib/contentSegments.js';
import { parseFrontendToolParams } from '../lib/frontendToolParams.js';
import { renderMarkdown } from '../lib/markdownRenderer.js';
import { parseLeadingAgentMention } from '../lib/mentionParser.js';
import { consumeJsonSseStream } from '../lib/sseParser.js';
import { createAppContext } from './context/createAppContext.js';
import { createStatusDebugRuntime } from './runtime/statusDebugRuntime.js';
import { createTimelineRuntime } from './runtime/timelineRuntime.js';
import { createUiRuntime } from './runtime/uiRuntime.js';
import { createPlanRuntime } from './runtime/planRuntime.js';
import { createFrontendToolRuntime } from './runtime/frontendToolRuntime.js';
import { createViewportRuntime } from './runtime/viewportRuntime.js';
import { createChatActions } from './actions/chatActions.js';
import { createMessageActions } from './actions/messageActions.js';
import { createAgwEventHandler } from './handlers/agwEventHandler.js';
import { bindDomEvents } from './handlers/domEvents.js';

export function createBootstrapContext() {
  const ctx = createAppContext();

  ctx.services = {
    ApiError,
    createQueryStream,
    getAgents,
    getChat,
    getChats,
    getViewport,
    setAccessToken,
    submitTool,
    safeJsonParse,
    parseContentSegments,
    parseFrontendToolParams,
    renderMarkdown,
    parseLeadingAgentMention,
    consumeJsonSseStream,
    actionRuntime: null
  };

  ctx.services.actionRuntime = createActionRuntime({
    root: document.documentElement,
    canvas: ctx.elements.fireworksCanvas,
    modalRoot: ctx.elements.modalRoot,
    modalTitle: ctx.elements.modalTitle,
    modalContent: ctx.elements.modalContent,
    modalClose: ctx.elements.modalClose,
    onStatus: (text) => {
      if (typeof ctx.ui.setStatus === 'function') {
        ctx.ui.setStatus(text);
      }
    }
  });

  const statusRuntime = createStatusDebugRuntime(ctx);
  const timelineRuntime = createTimelineRuntime(ctx);
  const uiRuntime = createUiRuntime(ctx);
  const planRuntime = createPlanRuntime(ctx);
  const frontendToolRuntime = createFrontendToolRuntime(ctx);
  const viewportRuntime = createViewportRuntime(ctx);

  ctx.ui = {
    ...ctx.ui,
    ...statusRuntime,
    ...timelineRuntime,
    ...uiRuntime,
    ...planRuntime,
    ...frontendToolRuntime,
    ...viewportRuntime
  };

  const chatActions = createChatActions(ctx);
  ctx.actions = {
    ...ctx.actions,
    ...chatActions
  };

  const messageActions = createMessageActions(ctx);
  ctx.actions = {
    ...ctx.actions,
    ...messageActions
  };

  ctx.handlers = {
    ...ctx.handlers,
    ...createAgwEventHandler(ctx)
  };

  return ctx;
}

export async function bootstrapApp() {
  const ctx = createBootstrapContext();
  const { state, elements, actions, ui, services } = ctx;

  bindDomEvents(ctx);
  ui.updateLayoutMode(window.innerWidth);
  ui.updateChatChip();
  ui.renderAgentLock();
  ui.renderMessages({ full: true, stickToBottom: false });
  ui.renderEvents();
  ui.renderPlan();
  ui.renderChats();
  ui.renderPendingTools();
  ui.renderActiveFrontendTool();
  ui.renderDebugTabs();
  ui.renderMentionSuggestions();
  ui.autosizeComposerInput();
  ui.setViewportExpanded(false);
  ui.setSettingsOpen(false);
  ui.syncDrawerState();

  const restoredToken = ui.readStoredAccessToken();
  state.accessToken = restoredToken;
  elements.accessTokenInput.value = restoredToken;
  services.setAccessToken(restoredToken);

  try {
    await Promise.all([actions.refreshAgents(), actions.refreshChats()]);
    ui.setStatus('ready');
  } catch (error) {
    ui.setStatus(`bootstrap failed: ${error.message}`, 'error');
  }

  return ctx;
}
