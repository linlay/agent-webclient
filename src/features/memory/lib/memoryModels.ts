import type {
  MemoryContextPreviewResponse,
  MemoryPreferenceScopeType,
  MemoryRecordDetail,
  MemoryRecordListItem,
  MemoryScopeDraftRecord,
} from "@/shared/data";

/** UI-only state shared by the Memory console surfaces. */
export interface MemoryUiModels {
  activeScope: MemoryPreferenceScopeType;
  records: MemoryRecordListItem[];
  selectedRecord: MemoryRecordDetail | null;
  preferenceDraft: MemoryScopeDraftRecord[];
  preview: MemoryContextPreviewResponse | null;
}
