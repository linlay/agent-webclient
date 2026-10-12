export interface EditingModeSyncInput {
  // The Agent detail has not arrived, so entry visibility is still unknown.
  pending: boolean;
  available: boolean;
  current: boolean | undefined;
  activeRunId: string;
  activeRunEditingMode: boolean | undefined;
  adoptedRunId: string;
}

export interface EditingModeSyncResult {
  // Absent means the current choice is kept.
  set?: { enabled: boolean | undefined };
  adoptedRunId: string;
}

// Decides what the editing toggle should hold. While the entry is shown its
// value is always explicit; a Run already running in the Chat supplies the
// choice it was started with, once, so later toggles are not overwritten.
export function resolveEditingModeSync(input: EditingModeSyncInput): EditingModeSyncResult {
  const keep = { adoptedRunId: input.adoptedRunId };
  if (input.pending) return keep;
  if (!input.available) {
    return input.current === undefined ? keep : { ...keep, set: { enabled: undefined } };
  }
  // An unset choice means the conversation was reset (for example by leaving
  // and re-entering the Chat), so the running Run is adopted again.
  if (input.activeRunId && input.activeRunEditingMode !== undefined &&
    (input.adoptedRunId !== input.activeRunId || input.current === undefined)) {
    const adopted = { adoptedRunId: input.activeRunId };
    return input.current === input.activeRunEditingMode
      ? adopted
      : { ...adopted, set: { enabled: input.activeRunEditingMode } };
  }
  return input.current === undefined ? { ...keep, set: { enabled: false } } : keep;
}

export function shouldClearPlanningMode(input: {
  pending: boolean; available: boolean; planningMode: boolean;
}): boolean {
  return !input.pending && input.planningMode && !input.available;
}
