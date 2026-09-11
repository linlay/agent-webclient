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
  /** Absolute preparation deadline; scroll restoration has its own budget. */
  startedAt?: number;
  deadlineAt?: number;
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
  chatSurfaceBlocked: boolean;
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
  | { type: "SET_CHAT_SURFACE_BLOCKED"; blocked: boolean }
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
    chatSurfaceBlocked: false,
    conversationScrollRequest: null,
    planningMode: false,
    planningModeByChatId: {},
    editingMode: false,
    downvotedRunKeys: new Set(),
  };
}
