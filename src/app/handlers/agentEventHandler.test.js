import { describe, expect, it, vi } from 'vitest';

import { createState } from '../context/state.js';
import { createAgentEventHandler } from './agentEventHandler.js';

function createTestContext() {
  const state = createState();
  const refreshChats = vi.fn(() => Promise.resolve());

  const ui = {
    appendDebug: vi.fn(),
    updateChatChip: vi.fn(),
    renderChats: vi.fn(),
    setStatus: vi.fn(),
    clearActiveFrontendTool: vi.fn(),
    renderEvents: vi.fn(),
    renderPendingTools: vi.fn()
  };

  const actions = {
    refreshChats
  };

  const services = {
    safeJsonParse: vi.fn(() => ({})),
    actionRuntime: {
      execute: vi.fn()
    }
  };

  return {
    state,
    ui,
    actions,
    services,
    refreshChats
  };
}

describe('agentEventHandler run.complete chat refresh', () => {
  it('refreshes chats for live run.complete events', () => {
    const ctx = createTestContext();
    ctx.state.streaming = true;
    const handler = createAgentEventHandler(ctx);

    handler.handleAgentEvent({ type: 'run.complete', runId: 'run-live' }, 'live');

    expect(ctx.refreshChats).toHaveBeenCalledTimes(1);
    expect(ctx.state.streaming).toBe(false);
    expect(ctx.ui.clearActiveFrontendTool).toHaveBeenCalledTimes(1);
  });

  it('does not refresh chats for history run.complete events', () => {
    const ctx = createTestContext();
    ctx.state.streaming = true;
    const handler = createAgentEventHandler(ctx);

    handler.handleAgentEvent({ type: 'run.complete', runId: 'run-history' }, 'history');

    expect(ctx.refreshChats).not.toHaveBeenCalled();
    expect(ctx.state.streaming).toBe(false);
    expect(ctx.ui.clearActiveFrontendTool).toHaveBeenCalledTimes(1);
  });
});
