import type { KBasesState } from "@/features/kbases/lib/kbasesState";
import type { ComposerState, ComposerAction, SubmissionDraft } from "./composerState";
function restore<S extends ComposerState & KBasesState & { chatId: string }>(state: S, draft: SubmissionDraft): S {
  return { ...state, composerDraft: draft.message,
    composerDraftByChatId: { ...state.composerDraftByChatId, [state.chatId]: draft.message },
    ...(draft.kbaseScope && draft.kbases ? {selectedKbasesByScope: {...state.selectedKbasesByScope, [draft.kbaseScope]: draft.kbases.map(item => ({...item}))}} : {}),
    selectedSkills: draft.skills,
    selectedSkillsByChatId: { ...state.selectedSkillsByChatId, [state.chatId]: draft.skills },
    restoredSteerReferencesByChatId: { ...state.restoredSteerReferencesByChatId, [state.chatId]: draft.references } };
}
export function reduceSubmissionDraft<S extends ComposerState & KBasesState & { chatId: string }>(state: S, action: ComposerAction): S | null {
  switch (action.type) {
    case "TOUCH_COMPOSER": return { ...state, composerEditVersion: state.composerEditVersion + 1 };
    case "BEGIN_COMPOSER_SUBMISSION": {
      const version = state.composerEditVersion + 1;
      return { ...state, composerEditVersion: version, submissionDrafts: { ...state.submissionDrafts, [action.draft.requestId]: { ...action.draft, references: JSON.parse(JSON.stringify(action.draft.references)), skills: action.draft.skills.map(item => ({...item})), kbases: action.draft.kbases?.map(item => ({...item})), version } } };
    }
    case "SETTLE_COMPOSER_SUBMISSION": {
      const draft = state.submissionDrafts[action.requestId];
      if (!draft) return state;
      const drafts = { ...state.submissionDrafts }; delete drafts[action.requestId];
      const next = { ...state, submissionDrafts: drafts };
      if (action.accepted) return next;
      return state.composerEditVersion === draft.version
        ? restore(next, draft)
        : { ...next, failedSubmissions: [...state.failedSubmissions, draft] };
    }
    case "DISCARD_FAILED_SUBMISSION": return { ...state, failedSubmissions: state.failedSubmissions.filter(draft => draft.requestId !== action.requestId) };
    case "RESTORE_FAILED_SUBMISSION": {
      const draft = state.failedSubmissions.find(item => item.requestId === action.requestId);
      if (!draft) return state;
      // Manual recovery preserves newer text, references and selections.
      const skills = [...state.selectedSkills];
      for (const skill of draft.skills) if (!skills.some(item => item.id.toLowerCase() === skill.id.toLowerCase())) skills.push(skill);
      const references = [...(state.restoredSteerReferencesByChatId[state.chatId] || []), ...draft.references];
      return restore({ ...state, failedSubmissions: state.failedSubmissions.filter(item => item !== draft) }, {
        ...draft, kbases: draft.kbaseScope ? [...new Map([...(draft.kbases || []), ...(state.selectedKbasesByScope[draft.kbaseScope] || [])].map(item => [item.id, item])).values()] : draft.kbases, message: [state.composerDraft, draft.message].filter(Boolean).join("\n\n"), skills, references,
      });
    }
    case "SET_SKILL_REJECTION": return { ...state, skillRejection: action.rejection };
    default: return null;
  }
}
