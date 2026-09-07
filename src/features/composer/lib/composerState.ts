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

export function reduceComposerState(state: ComposerState, action: ComposerAction): ComposerState {
  switch (action.type) {
    case "SET_COMPOSER_DRAFT": return { ...state, composerDraft: action.draft };
    case "SET_SELECTED_SKILLS": return { ...state, selectedSkills: action.skills };
    case "SET_MENTION_OPEN": return { ...state, mentionOpen: action.open };
    case "SET_MENTION_SUGGESTIONS": return { ...state, mentionSuggestions: action.agents };
    case "SET_MENTION_ACTIVE_INDEX": return { ...state, mentionActiveIndex: action.index };
    case "CLEAR_PENDING_STEERS": return { ...state, pendingSteers: {} };
    case "ENQUEUE_PENDING_STEER":
    case "UPDATE_PENDING_STEER_STATUS":
    case "REMOVE_PENDING_STEER": return state;
  }
}
