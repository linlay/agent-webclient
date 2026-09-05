import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type { Message } from "@/features/conversation/lib/messageState";

export type ConversationSurfaceMode = "main" | "agent" | "copilot";
export type ChatTransitionPhase = "loading" | "applying" | "restoring" | "ready" | "error";
export type ChatTransitionKind = "initial-load" | "history-switch" | "same-chat-reload";
export type ChatTransitionDisplayMode = "blocking" | "background";

export interface ChatTransition {
  seq: number;
  sourceChatId: string;
  targetChatId: string;
  phase: ChatTransitionPhase;
  kind: ChatTransitionKind;
  displayMode: ChatTransitionDisplayMode;
  focusComposerOnReady: boolean;
  error: string;
}

export interface ConversationScrollRequest {
  id: number;
  chatId: string;
  target: "bottom";
  reason: "local-send" | "user-click";
}

export interface ConversationState {
  chatAgentById: Map<string, string>;
  runAgentById: Map<string, string>;
  currentRunAgentKey: string;
  chatId: string;
  runId: string;
  requestId: string;
  streaming: boolean;
  abortController: AbortController | null;
  messagesById: Map<string, Message>;
  messageOrder: string[];
  events: AgentEvent[];
  chatLoadSeq: number;
  chatTransition: ChatTransition | null;
  conversationScrollRequest: ConversationScrollRequest | null;
  planningMode: boolean;
  planningModeByChatId: Record<string, boolean>;
  editingMode: boolean;
  downvotedRunKeys: Set<string>;
}

export type ConversationAction =
  | { type: "SET_CHAT_ID"; chatId: string }
  | { type: "BEGIN_CHAT_TRANSITION"; transition: ChatTransition }
  | { type: "SET_CHAT_TRANSITION_DISPLAY_MODE"; seq: number; targetChatId: string; displayMode: ChatTransitionDisplayMode }
  | { type: "ADVANCE_CHAT_TRANSITION"; seq: number; targetChatId: string; phase: Extract<ChatTransitionPhase, "applying" | "restoring" | "ready"> }
  | { type: "FAIL_CHAT_TRANSITION"; seq: number; targetChatId: string; error: string }
  | { type: "CLEAR_CHAT_TRANSITION" }
  | { type: "REQUEST_CONVERSATION_SCROLL"; chatId: string; reason: "local-send" | "user-click" }
  | { type: "SET_RUN_ID"; runId: string }
  | { type: "SET_RUN_AGENT_BY_ID"; runId: string; agentKey: string }
  | { type: "SET_CURRENT_RUN_AGENT_KEY"; agentKey: string }
  | { type: "SET_REQUEST_ID"; requestId: string }
  | { type: "SET_STREAMING"; streaming: boolean }
  | { type: "SET_ABORT_CONTROLLER"; controller: AbortController | null }
  | { type: "PUSH_EVENT"; event: AgentEvent }
  | { type: "CLEAR_EVENTS" }
  | { type: "SET_PLANNING_MODE"; chatId: string; enabled: boolean; persist?: boolean }
  | { type: "SET_EDITING_MODE"; enabled: boolean }
  | { type: "TOGGLE_RUN_DOWNVOTE"; runKey: string }
  | { type: "SET_RUN_DOWNVOTED"; runKey: string; downvoted: boolean }
  | { type: "SET_MESSAGE"; id: string; message: Message }
  | { type: "SET_MESSAGE_ORDER"; order: string[] }
  | { type: "SET_CHAT_AGENT_BY_ID"; chatId: string; agentKey: string };

export function createInitialConversationState(): ConversationState {
  return {
    chatAgentById: new Map(),
    runAgentById: new Map(),
    currentRunAgentKey: "",
    chatId: "",
    runId: "",
    requestId: "",
    streaming: false,
    abortController: null,
    messagesById: new Map(),
    messageOrder: [],
    events: [],
    chatLoadSeq: 0,
    chatTransition: null,
    conversationScrollRequest: null,
    planningMode: false,
    planningModeByChatId: {},
    editingMode: false,
    downvotedRunKeys: new Set(),
  };
}

export function reduceConversationState(
  state: ConversationState,
  action: ConversationAction,
): ConversationState {
  switch (action.type) {
    case "SET_CHAT_ID": return { ...state, chatId: action.chatId };
    case "BEGIN_CHAT_TRANSITION": return { ...state, chatTransition: action.transition };
    case "CLEAR_CHAT_TRANSITION": return { ...state, chatTransition: null };
    case "SET_RUN_ID": return { ...state, runId: action.runId };
    case "SET_CURRENT_RUN_AGENT_KEY": return { ...state, currentRunAgentKey: action.agentKey };
    case "SET_REQUEST_ID": return { ...state, requestId: action.requestId };
    case "SET_STREAMING": return { ...state, streaming: action.streaming };
    case "SET_ABORT_CONTROLLER": return { ...state, abortController: action.controller };
    case "PUSH_EVENT": return { ...state, events: [...state.events, action.event] };
    case "CLEAR_EVENTS": return { ...state, events: [] };
    case "SET_EDITING_MODE": return { ...state, editingMode: action.enabled };
    case "SET_MESSAGE": return { ...state, messagesById: new Map(state.messagesById).set(action.id, action.message) };
    case "SET_MESSAGE_ORDER": return { ...state, messageOrder: action.order };
    case "SET_CHAT_AGENT_BY_ID": return { ...state, chatAgentById: new Map(state.chatAgentById).set(action.chatId, action.agentKey) };
    case "SET_RUN_AGENT_BY_ID": return { ...state, runAgentById: new Map(state.runAgentById).set(action.runId, action.agentKey) };
    case "REQUEST_CONVERSATION_SCROLL": return { ...state, conversationScrollRequest: { id: (state.conversationScrollRequest?.id || 0) + 1, chatId: action.chatId, target: "bottom", reason: action.reason } };
    case "SET_CHAT_TRANSITION_DISPLAY_MODE":
    case "ADVANCE_CHAT_TRANSITION":
    case "FAIL_CHAT_TRANSITION":
    case "SET_PLANNING_MODE":
    case "TOGGLE_RUN_DOWNVOTE":
    case "SET_RUN_DOWNVOTED":
      return state;
  }
}
