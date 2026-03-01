export function bindDomEvents(ctx) {
  const { state, elements, actions, ui, services } = ctx;

  function refreshChatsWithStatus() {
    actions.refreshChats().catch((error) => {
      ui.setStatus(`refresh chats failed: ${error.message}`, 'error');
    });
  }

  elements.refreshAgentsBtn.addEventListener('click', () => {
    actions.refreshAgents().catch((error) => {
      ui.setStatus(`refresh agents failed: ${error.message}`, 'error');
    });
  });

  elements.refreshChatsBtn.addEventListener('click', () => {
    refreshChatsWithStatus();
  });

  if (elements.chatListRefreshBtn) {
    elements.chatListRefreshBtn.addEventListener('click', () => {
      refreshChatsWithStatus();
    });
  }

  elements.loadRawBtn.addEventListener('click', () => {
    if (!state.chatId) {
      ui.setStatus('current chatId is empty', 'error');
      return;
    }

    actions.loadChat(state.chatId, true).catch((error) => {
      ui.setStatus(`load raw chat failed: ${error.message}`, 'error');
    });
  });

  elements.stopStreamBtn.addEventListener('click', () => {
    actions.stopStreaming();
  });

  elements.themeToggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    services.actionRuntime.setTheme(next);
  });

  elements.newChatBtn.addEventListener('click', () => {
    actions.startNewChat();
  });

  elements.chatSearchInput.addEventListener('input', (event) => {
    state.chatFilter = event.target.value || '';
    ui.renderChats();
  });

  elements.settingsToggleBtn.addEventListener('click', () => {
    ui.setSettingsOpen(true);
  });

  elements.settingsCloseBtn.addEventListener('click', () => {
    ui.setSettingsOpen(false);
  });

  elements.accessTokenApply.addEventListener('click', () => {
    actions.applyAccessToken().catch((error) => {
      ui.setStatus(`apply token failed: ${error.message}`, 'error');
    });
  });

  elements.accessTokenClear.addEventListener('click', () => {
    actions.clearAccessToken().catch((error) => {
      ui.setStatus(`clear token failed: ${error.message}`, 'error');
    });
  });

  elements.accessTokenInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    actions.applyAccessToken().catch((error) => {
      ui.setStatus(`apply token failed: ${error.message}`, 'error');
    });
  });

  elements.accessTokenInput.addEventListener('input', () => {
    ui.clearAccessTokenError();
  });

  elements.settingsModal.addEventListener('click', (event) => {
    if (event.target === elements.settingsModal) {
      ui.setSettingsOpen(false);
    }
  });

  elements.openLeftDrawerBtn.addEventListener('click', () => {
    if (state.layoutMode !== 'mobile-drawer') {
      return;
    }
    state.leftDrawerOpen = true;
    state.rightDrawerOpen = false;
    ui.syncDrawerState();
  });

  elements.openRightDrawerBtn.addEventListener('click', () => {
    if (state.layoutMode === 'desktop-fixed') {
      return;
    }
    state.rightDrawerOpen = true;
    if (state.layoutMode === 'mobile-drawer') {
      state.leftDrawerOpen = false;
    }
    ui.syncDrawerState();
  });

  elements.leftDrawerCloseBtn.addEventListener('click', () => {
    if (state.layoutMode !== 'mobile-drawer') {
      return;
    }
    state.leftDrawerOpen = false;
    ui.syncDrawerState();
  });

  elements.rightDrawerCloseBtn.addEventListener('click', () => {
    if (state.layoutMode === 'desktop-fixed') {
      return;
    }
    state.rightDrawerOpen = false;
    ui.syncDrawerState();
  });

  elements.drawerOverlay.addEventListener('click', () => {
    ui.closeDrawers();
  });

  elements.planToggleBtn.addEventListener('click', () => {
    ui.setPlanExpanded(!state.planExpanded, { manual: true });
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
      ui.renderMessages({ nodeId: node.id, stickToBottom: false });
      return;
    }

    if (action === 'toggle-tool' && node.kind === 'tool') {
      node.expanded = !node.expanded;
      ui.renderMessages({ nodeId: node.id, stickToBottom: false });
    }
  });

  elements.debugTabs.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.getAttribute('data-debug-tab');
      ui.setDebugTab(tab);
    });
  });

  elements.events.addEventListener('click', (event) => {
    const row = event.target.closest('.event-row[data-event-index]');
    if (!row) {
      return;
    }

    const eventIndex = Number(row.getAttribute('data-event-index'));
    if (!Number.isInteger(eventIndex)) {
      return;
    }

    ui.toggleEventPopover(eventIndex, row.getBoundingClientRect());
  });

  elements.eventPopoverClose.addEventListener('click', () => {
    ui.hideEventPopover();
  });

  document.addEventListener('click', (event) => {
    const row = event.target.closest('.event-row[data-event-index]');
    if (row) {
      return;
    }

    if (ui.isEventPopoverTarget(event.target)) {
      return;
    }

    ui.hideEventPopover();
  });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229) {
      return;
    }

    const key = String(event.key || '');
    const keyLower = key.toLowerCase();

    if ((event.metaKey || event.ctrlKey) && !event.altKey && keyLower === 'k') {
      event.preventDefault();
      if (elements.messageInput.disabled) {
        return;
      }
      elements.messageInput.focus();
      const caret = elements.messageInput.value.length;
      elements.messageInput.setSelectionRange(caret, caret);
      return;
    }

    if (key !== 'Escape') {
      return;
    }

    let handled = false;

    if (state.mentionOpen) {
      ui.closeMentionSuggestions();
      handled = true;
    }

    if (state.eventPopoverIndex !== -1) {
      ui.hideEventPopover();
      handled = true;
    }

    if (state.settingsOpen) {
      ui.setSettingsOpen(false);
      handled = true;
    }

    if (state.layoutMode !== 'desktop-fixed' && (state.leftDrawerOpen || state.rightDrawerOpen)) {
      ui.closeDrawers();
      handled = true;
    }

    if (handled) {
      event.preventDefault();
    }
  });

  elements.clearLogsBtn.addEventListener('click', () => {
    state.debugLines.length = 0;
    elements.debugLog.textContent = '';
    ui.setStatus('logs cleared');
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

    actions.loadChat(chatId).catch((error) => {
      ui.setStatus(`load chat failed: ${error.message}`, 'error');
    });
  });

  elements.sendBtn.addEventListener('click', () => {
    actions.sendMessage().catch((error) => {
      ui.setStatus(`send failed: ${error.message}`, 'error');
    });
  });

  elements.messageInput.addEventListener('input', () => {
    ui.autosizeComposerInput();
    ui.updateMentionSuggestions();
  });

  elements.messageInput.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) {
      return;
    }

    if (state.mentionOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        state.mentionActiveIndex = (state.mentionActiveIndex + 1) % state.mentionSuggestions.length;
        ui.renderMentionSuggestions();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        state.mentionActiveIndex = (state.mentionActiveIndex - 1 + state.mentionSuggestions.length) % state.mentionSuggestions.length;
        ui.renderMentionSuggestions();
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        ui.selectMentionByIndex(state.mentionActiveIndex);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        ui.closeMentionSuggestions();
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        ui.selectMentionByIndex(state.mentionActiveIndex);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      actions.sendMessage().catch((error) => {
        ui.setStatus(`send failed: ${error.message}`, 'error');
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

    ui.selectMentionByIndex(index);
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
      actions.submitActiveFrontendTool(params).catch((error) => {
        ui.setFrontendToolStatus(`提交失败：${error.message}`, 'error');
        ui.setStatus(`submit failed: ${error.message}`, 'error');
      });
      return;
    }

    if (data.type !== 'chat_message') {
      return;
    }

    if (state.activeFrontendTool) {
      ui.setStatus('前端工具等待提交中，请先完成当前确认', 'error');
      return;
    }

    const message = typeof data.message === 'string' ? data.message.trim() : '';
    if (!message) {
      return;
    }

    elements.messageInput.value = message;
    ui.autosizeComposerInput();
    ui.closeMentionSuggestions();

    if (state.streaming) {
      actions.stopStreaming();
      window.setTimeout(() => {
        actions.sendMessage(message).catch((error) => {
          ui.setStatus(`viewport relay send failed: ${error.message}`, 'error');
        });
      }, 80);
      return;
    }

    actions.sendMessage(message).catch((error) => {
      ui.setStatus(`viewport relay send failed: ${error.message}`, 'error');
    });
  });

  window.addEventListener('resize', () => {
    ui.hideEventPopover();
    ui.autosizeComposerInput();
    ui.updateLayoutMode(window.innerWidth);
  });
}
