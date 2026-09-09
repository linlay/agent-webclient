import type {
  ComposerState,
  ComposerSteerAction,
  PendingSteer,
  PendingSteerTarget,
} from "./composerState";

type ComposerSteerState = Pick<ComposerState, "pendingSteers" | "composerDraft" | "composerDraftByChatId">;

export function findPendingSteer(
  pendingSteers: ComposerState["pendingSteers"],
  target: PendingSteerTarget,
): { chatId: string; steer: PendingSteer } | null {
  const chatIds = target.chatId === undefined ? Object.keys(pendingSteers) : [target.chatId];
  for (const chatId of chatIds) {
    const steer = pendingSteers[chatId]?.find(item => item.steerId === target.steerId &&
      (target.runId === undefined || item.runId === target.runId));
    if (steer) return { chatId, steer };
  }
  return null;
}

export function reduceComposerSteerState(
  state: ComposerSteerState,
  action: ComposerSteerAction,
  currentChatId: string,
): Partial<ComposerSteerState> | null {
  const pendingSteers = state.pendingSteers;
  if (action.type === "ENQUEUE_PENDING_STEER") {
    const chatId = action.chatId ?? currentChatId;
    const existing = pendingSteers[chatId] || [];
    if (existing.some(steer => steer.steerId === action.steer.steerId)) return null;
    return { pendingSteers: { ...pendingSteers, [chatId]: [...existing, action.steer] } };
  }
  if (action.type === "CLEAR_PENDING_STEERS") {
    if (!pendingSteers[currentChatId]?.length) return null;
    return { pendingSteers: { ...pendingSteers, [currentChatId]: [] } };
  }

  const matched = findPendingSteer(pendingSteers, action);
  // Stream confirmation may already have removed the entry before a response arrives.
  if (!matched) return null;
  const { chatId, steer } = matched;
  if (action.type === "UPDATE_PENDING_STEER_STATUS" || action.type === "SET_PENDING_STEER_ERROR") {
    if (action.type === "SET_PENDING_STEER_ERROR" && steer.status !== "sending") return null;
    const patch = action.type === "UPDATE_PENDING_STEER_STATUS"
      ? { status: action.status, submissionError: undefined }
      : { submissionError: action.error };
    return { pendingSteers: {
      ...pendingSteers,
      [chatId]: pendingSteers[chatId].map(item => item === steer ? { ...item, ...patch } : item),
    } };
  }

  const remaining = pendingSteers[chatId].filter(item => item !== steer);
  const nextPendingSteers = { ...pendingSteers };
  if (remaining.length) nextPendingSteers[chatId] = remaining;
  else delete nextPendingSteers[chatId];
  if (action.type !== "RESTORE_PENDING_STEER") return { pendingSteers: nextPendingSteers };

  const currentDraft = chatId === currentChatId ? state.composerDraft : state.composerDraftByChatId[chatId] || "";
  const draft = !currentDraft.trim() ? steer.message
    : currentDraft.trim() === steer.message.trim() ? currentDraft : `${currentDraft}\n\n${steer.message}`;
  return {
    pendingSteers: nextPendingSteers,
    composerDraftByChatId: { ...state.composerDraftByChatId, [chatId]: draft },
    ...(chatId === currentChatId ? { composerDraft: draft } : {}),
  };
}
