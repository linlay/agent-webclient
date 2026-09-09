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
}

export interface ComposerState {
  mentionOpen: boolean;
  mentionSuggestions: Agent[];
  mentionActiveIndex: number;
  composerDraft: string;
  composerDraftByChatId: Record<string, string>;
  selectedSkills: ComposerRequiredSkill[];
  selectedSkillsByChatId: Record<string, ComposerRequiredSkill[]>;
  pendingSteers: Record<string, PendingSteer[]>;
}

export type ComposerDraftState = Pick<
  ComposerState,
  "composerDraft" | "composerDraftByChatId" | "selectedSkills" | "selectedSkillsByChatId"
>;

export type ComposerAction =
  | { type: "SET_COMPOSER_DRAFT"; draft: string }
  | { type: "SET_SELECTED_SKILLS"; skills: ComposerRequiredSkill[] }
  | { type: "ENQUEUE_PENDING_STEER"; steer: PendingSteer }
  | { type: "UPDATE_PENDING_STEER_STATUS"; steerId: string; status: PendingSteer["status"] }
  | { type: "REMOVE_PENDING_STEER"; steerId: string }
  | { type: "CLEAR_PENDING_STEERS" }
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
