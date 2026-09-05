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
export function reduceOverviewState(state: OverviewState, action: OverviewAction): OverviewState {
  const key = `${action.fileChange.runId}:${action.fileChange.filePath}`;
  return { ...state, fileChanges: [...state.fileChanges.filter((item) => `${item.runId}:${item.filePath}` !== key), action.fileChange] };
}
