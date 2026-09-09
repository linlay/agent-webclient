import type { Agent } from "@/features/agents/lib/agentState";

export interface ComposerRequiredSkill {
  key: string;
  label: string;
}

export interface PendingSteer {
  steerId: string;
  message: string;
  requestId: string;
  runId: string;
  createdAt: number;
  status: "queued" | "sending";
  submissionError?: string;
  references?: unknown[];
}

export interface PendingSteerTarget {
  steerId: string;
  chatId?: string;
  runId?: string;
}

export type ComposerSteerAction =
  | { type: "SET_RESTORED_STEER_REFERENCES"; chatId: string; references: unknown[] }
  | { type: "ENQUEUE_PENDING_STEER"; steer: PendingSteer; chatId?: string }
  | ({ type: "UPDATE_PENDING_STEER_STATUS"; status: PendingSteer["status"] } & PendingSteerTarget)
  | ({ type: "REMOVE_PENDING_STEER" } & PendingSteerTarget)
  | ({ type: "CONFIRM_PENDING_STEER" } & PendingSteerTarget)
  | { type: "SET_PENDING_STEER_ERROR"; chatId: string; runId: string; steerId: string; error: string }
  | { type: "RESTORE_PENDING_STEER"; chatId: string; runId: string; steerId: string }
  | { type: "CLEAR_PENDING_STEERS" };

export interface ComposerState {
  mentionOpen: boolean;
  mentionSuggestions: Agent[];
  mentionActiveIndex: number;
  composerDraft: string;
  composerDraftByChatId: Record<string, string>;
  selectedSkills: ComposerRequiredSkill[];
  selectedSkillsByChatId: Record<string, ComposerRequiredSkill[]>;
  pendingSteers: Record<string, PendingSteer[]>;
  restoredSteerReferencesByChatId: Record<string, unknown[]>;
}

export type ComposerDraftState = Pick<
  ComposerState,
  "composerDraft" | "composerDraftByChatId" | "selectedSkills" | "selectedSkillsByChatId"
>;

export type ComposerAction =
  | { type: "SET_COMPOSER_DRAFT"; draft: string }
  | { type: "SET_SELECTED_SKILLS"; skills: ComposerRequiredSkill[] }
  | ComposerSteerAction
  | { type: "SET_MENTION_OPEN"; open: boolean }
  | { type: "SET_MENTION_SUGGESTIONS"; agents: Agent[] }
  | { type: "SET_MENTION_ACTIVE_INDEX"; index: number };

export function createInitialComposerState(): ComposerState {
  return {
    mentionOpen: false,
    mentionSuggestions: [],
    mentionActiveIndex: 0,
    composerDraft: "",
    composerDraftByChatId: {},
    selectedSkills: [],
    selectedSkillsByChatId: {},
    pendingSteers: {},
    restoredSteerReferencesByChatId: {},
  };
}

export function updateComposerDraft(
  state: ComposerDraftState,
  chatId: string,
  draft: string,
): Pick<ComposerDraftState, "composerDraft" | "composerDraftByChatId"> {
  return {
    composerDraft: draft,
    composerDraftByChatId: { ...state.composerDraftByChatId, [chatId]: draft },
  };
}

export function updateComposerSelectedSkills(
  state: ComposerDraftState,
  chatId: string,
  skills: ComposerRequiredSkill[],
): Pick<ComposerDraftState, "selectedSkills" | "selectedSkillsByChatId"> {
  return {
    selectedSkills: skills,
    selectedSkillsByChatId: { ...state.selectedSkillsByChatId, [chatId]: skills },
  };
}

export function switchComposerChat(
  state: ComposerDraftState,
  sourceChatId: string,
  targetChatId: string,
): ComposerDraftState {
  // The empty chat ID is shared by all new conversations, including across Agents.
  const chatChanged = sourceChatId !== targetChatId;
  const composerDraftByChatId = chatChanged
    ? { ...state.composerDraftByChatId, [sourceChatId]: state.composerDraft }
    : state.composerDraftByChatId;
  const selectedSkillsByChatId = chatChanged
    ? { ...state.selectedSkillsByChatId, [sourceChatId]: state.selectedSkills }
    : state.selectedSkillsByChatId;

  return {
    composerDraft: composerDraftByChatId[targetChatId] ?? "",
    composerDraftByChatId,
    selectedSkills: selectedSkillsByChatId[targetChatId] ?? [],
    selectedSkillsByChatId,
  };
}
