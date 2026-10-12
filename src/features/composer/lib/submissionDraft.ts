import { queryReferences } from "@/shared/contracts/references";
import type { ComposerState, ComposerAction, SubmissionDraft } from "./composerState";
function restore<S extends ComposerState & { chatId: string }>(state: S, draft: SubmissionDraft): S {
  return { ...state, composerDraft: draft.message,
    composerDraftByChatId: { ...state.composerDraftByChatId, [state.chatId]: draft.message },
    composerReferences: draft.references,
    restoredSteerReferencesByChatId: { ...state.restoredSteerReferencesByChatId, [state.chatId]: draft.references } };
}
export function reduceSubmissionDraft<S extends ComposerState & { chatId: string }>(state: S, action: ComposerAction): S | null {
  switch (action.type) {
    case "TOUCH_COMPOSER": return { ...state, composerEditVersion: state.composerEditVersion + 1 };
    case "BEGIN_COMPOSER_SUBMISSION": {
      if (action.draft.schemaVersion !== 2) return state;
      const version = state.composerEditVersion + 1;
      return { ...state, composerEditVersion: version, submissionDrafts: { ...state.submissionDrafts, [action.draft.requestId]: { ...action.draft, references: JSON.parse(JSON.stringify(action.draft.references)), version } } };
    }
    case "SETTLE_COMPOSER_SUBMISSION": {
      const draft = state.submissionDrafts[action.requestId];
      if (!draft) return state;
      const drafts = { ...state.submissionDrafts }; delete drafts[action.requestId];
      const next = { ...state, submissionDrafts: drafts };
      if (action.accepted || draft.schemaVersion !== 2) return next;
      return state.composerEditVersion === draft.version
        ? restore(next, draft)
        : { ...next, failedSubmissions: [...state.failedSubmissions, draft] };
    }
    case "DISCARD_FAILED_SUBMISSION": return { ...state, failedSubmissions: state.failedSubmissions.filter(draft => draft.requestId !== action.requestId) };
    case "RESTORE_FAILED_SUBMISSION": {
      const draft = state.failedSubmissions.find(item => item.requestId === action.requestId);
      const next = { ...state, failedSubmissions: state.failedSubmissions.filter(item => item !== draft) };
      if (!draft || draft.schemaVersion !== 2) return next;
      return restore(next, { ...draft,
        message: [state.composerDraft, draft.message].filter(Boolean).join("\n\n"),
        references: queryReferences([...state.composerReferences, ...draft.references]),
      });
    }
    case "SET_SKILL_REJECTION": return { ...state, skillRejection: action.rejection };
    default: return null;
  }
}
