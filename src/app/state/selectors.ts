import type { AppState } from "@/app/state/types";

export function selectUiState(state: AppState) {
  return {
    settingsOpen: state.settingsOpen,
    leftDrawerOpen: state.leftDrawerOpen,
    desktopDebugSidebarEnabled: state.desktopDebugSidebarEnabled,
    terminalDockOpen: state.terminalDockOpen,
    themeMode: state.themeMode,
    transportMode: state.transportMode,
    wsStatus: state.wsStatus,
    wsErrorMessage: state.wsErrorMessage,
    audioMuted: state.audioMuted,
    ttsDebugStatus: state.ttsDebugStatus,
  };
}

export function selectNavigationState(state: AppState) {
  return {
    agents: state.agents,
    teams: state.teams,
    chats: state.chats,
    chatFilter: state.chatFilter,
    workerRows: state.workerRows,
    workerIndexByKey: state.workerIndexByKey,
    workerSelectionKey: state.workerSelectionKey,
    workerRelatedChats: state.workerRelatedChats,
    workerChatPanelCollapsed: state.workerChatPanelCollapsed,
    sidebarPendingRequestCount: state.sidebarPendingRequestCount,
  };
}

export function selectConversationState(state: AppState) {
  return {
    chatId: state.chatId,
    runId: state.runId,
    requestId: state.requestId,
    streaming: state.streaming,
    abortController: state.abortController,
    messagesById: state.messagesById,
    messageOrder: state.messageOrder,
    events: state.events,
    debugLines: state.debugLines,
    inputMode: state.inputMode,
    voiceChat: state.voiceChat,
    activeFrontendTool: state.activeFrontendTool,
    activeAwaiting: state.activeAwaiting,
    planningMode: state.planningMode,
  };
}

export function selectTimelineState(state: AppState) {
  return {
    timelineNodes: state.timelineNodes,
    timelineOrder: state.timelineOrder,
    contentNodeById: state.contentNodeById,
    reasoningNodeById: state.reasoningNodeById,
    toolNodeById: state.toolNodeById,
    toolStates: state.toolStates,
  };
}
