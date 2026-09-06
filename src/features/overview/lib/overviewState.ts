export interface FileChangeSummary {
  runId: string;
  filePath: string;
  addedLines: number;
  deletedLines: number;
  editedLines: number;
  operationCount: number;
  lastUpdatedAt: number;
}

export interface OverviewState {
  fileChanges: FileChangeSummary[];
}

export type OverviewAction = { type: "UPSERT_FILE_CHANGE"; fileChange: FileChangeSummary };
export function createInitialOverviewState(): OverviewState { return { fileChanges: [] }; }
export function reduceOverviewState<S extends OverviewState>(state: S, action: OverviewAction): S;
export function reduceOverviewState<S extends OverviewState>(state: S, action: { type: string }): S | null;
export function reduceOverviewState<S extends OverviewState>(state: S, input: { type: string }): S | null {
  const action = input as OverviewAction;
  switch (action.type) {
    case "UPSERT_FILE_CHANGE":
      return { ...state, fileChanges: upsertFileChange(state.fileChanges, action.fileChange) };
    default: return null;
  }
}

export function upsertFileChange(
  fileChanges: FileChangeSummary[],
  fileChange: FileChangeSummary,
): FileChangeSummary[] {
  const runId = String(fileChange.runId || "").trim();
  const filePath = String(fileChange.filePath || "").trim();
  if (!runId || !filePath) {
    return fileChanges;
  }
  if (!Number.isFinite(fileChange.lastUpdatedAt) || fileChange.lastUpdatedAt <= 0) {
    return fileChanges;
  }
  const normalizedChange: FileChangeSummary = {
    runId,
    filePath,
    addedLines: Math.max(0, Number(fileChange.addedLines) || 0),
    deletedLines: Math.max(0, Number(fileChange.deletedLines) || 0),
    editedLines: Math.max(0, Number(fileChange.editedLines) || 0),
    operationCount: Math.max(1, Number(fileChange.operationCount) || 1),
    lastUpdatedAt: fileChange.lastUpdatedAt,
  };

  const index = fileChanges.findIndex(
    (item) => item.runId === runId && item.filePath === filePath,
  );
  if (index < 0) {
    return [...fileChanges, normalizedChange];
  }

  const current = fileChanges[index];
  const next = fileChanges.slice();
  next[index] = {
    runId,
    filePath,
    addedLines: current.addedLines + normalizedChange.addedLines,
    deletedLines: current.deletedLines + normalizedChange.deletedLines,
    editedLines: current.editedLines + normalizedChange.editedLines,
    operationCount: current.operationCount + normalizedChange.operationCount,
    lastUpdatedAt: Math.max(current.lastUpdatedAt, normalizedChange.lastUpdatedAt),
  };
  return next;
}
